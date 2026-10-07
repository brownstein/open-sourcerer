import fs from "fs";
import path from "path";
import {
  Node,
  Project,
  SymbolFlags,
  SyntaxKind,
  Symbol as TsMorphSymbol,
  Type
} from "ts-morph";

import {
  EntityArgEntry,
  EntityTypeSignature,
  ValueSchema
} from "../../src/entities/metadata/metadataTypes";

const kOutputDirectory = "./src/entities/metadata";

const kMaxSchemaDepth = 8;

type SchemaExtractionContext = {
  /** The checker needs a node in scope to resolve member types. */
  locationNode: Node;
  expanding: Set<unknown>;
};

const kTiledObjectRefTypeName = "TiledObjectRef";

/** The alias resolves to plain `number` through the Type API, so an entity ref
 *  is only recognizable from the text of the declared type node. */
function isTiledObjectRefTypeNode(typeNode: Node | undefined): boolean {
  if (!typeNode) return false;
  const arms = typeNode
    .getText()
    .split("|")
    .map((arm) => arm.trim())
    .filter((arm) => arm !== "undefined" && arm !== "null");
  return (
    arms.length > 0 && arms.every((arm) => arm === kTiledObjectRefTypeName)
  );
}

function isFunctionType(type: Type): boolean {
  return type.getCallSignatures().length > 0;
}

function isClassInstanceType(type: Type): boolean {
  return !!type
    .getSymbol()
    ?.getDeclarations()
    .some((declaration) => declaration.isKind(SyntaxKind.ClassDeclaration));
}

function isMemberOptional(
  memberSymbol: TsMorphSymbol,
  memberType: Type
): boolean {
  if (memberSymbol.hasFlags(SymbolFlags.Optional)) return true;
  return (
    memberType.isUnion() &&
    memberType.getUnionTypes().some((member) => member.isUndefined())
  );
}

// Function arms are dropped: a union is still authorable through its data arms.
function extractUnionSchema(
  type: Type,
  context: SchemaExtractionContext,
  depth: number
): ValueSchema | undefined {
  const members = type
    .getUnionTypes()
    .filter(
      (member) =>
        !member.isUndefined() && !member.isNull() && !isFunctionType(member)
    );
  if (members.length === 0) return undefined;
  if (members.length === 1)
    return extractValueSchema(members[0], context, depth);

  if (members.every((member) => member.isStringLiteral())) {
    return {
      kind: "string",
      enumValues: members.map((member) => member.getLiteralValue() as string)
    };
  }

  const hasStringArray = members.some(
    (member) => member.isArray() && !!member.getArrayElementType()?.isString()
  );
  const hasString = members.some(
    (member) => member.isString() || member.isStringLiteral()
  );
  // A lone string fits in a one-element array, so the array form wins.
  if (hasStringArray && hasString) {
    return { kind: "array", element: { kind: "string", multiline: true } };
  }

  if (members.every((member) => member.isNumber() || member.isNumberLiteral()))
    return { kind: "number" };
  if (
    members.every((member) => member.isBoolean() || member.isBooleanLiteral())
  )
    return { kind: "boolean" };
  // Mixed unions collapse onto their string arm, which is how things like a
  // color or an id get written in a level file.
  if (hasString) return { kind: "string" };
  return undefined;
}

/** Returns undefined for types with no data representation. */
function extractValueSchema(
  type: Type,
  context: SchemaExtractionContext,
  depth: number
): ValueSchema | undefined {
  if (depth > kMaxSchemaDepth) return undefined;

  if (type.isBoolean() || type.isBooleanLiteral()) return { kind: "boolean" };
  if (type.isString()) return { kind: "string" };
  if (type.isNumber() || type.isNumberLiteral()) return { kind: "number" };
  if (type.isStringLiteral()) {
    return {
      kind: "string",
      enumValues: [type.getLiteralValue() as string]
    };
  }

  if (type.isUnion()) return extractUnionSchema(type, context, depth);

  if (type.isArray()) {
    const elementType = type.getArrayElementType();
    const element =
      elementType && extractValueSchema(elementType, context, depth + 1);
    return element ? { kind: "array", element } : undefined;
  }

  if (!type.isObject() || type.isTuple()) return undefined;
  if (isFunctionType(type) || type.getConstructSignatures().length > 0)
    return undefined;
  if (isClassInstanceType(type)) return undefined;
  if (context.expanding.has(type.compilerType)) return undefined;

  context.expanding.add(type.compilerType);
  try {
    const indexType = type.getStringIndexType();
    if (indexType) {
      const value = extractValueSchema(indexType, context, depth + 1);
      return value ? { kind: "record", value } : undefined;
    }

    const members: { name: string; optional: boolean; schema: ValueSchema }[] =
      [];
    for (const memberSymbol of type.getApparentProperties()) {
      const memberType = memberSymbol.getTypeAtLocation(context.locationNode);
      const optional = isMemberOptional(memberSymbol, memberType);
      const schema = extractValueSchema(memberType, context, depth + 1);
      if (!schema) {
        // A required member we can't represent means the shape isn't authorable.
        if (!optional) return undefined;
        continue;
      }
      members.push({ name: memberSymbol.getName(), optional, schema });
    }
    return members.length > 0 ? { kind: "object", members } : undefined;
  } finally {
    context.expanding.delete(type.compilerType);
  }
}

export async function run() {
  try {
    fs.mkdirSync(kOutputDirectory);
  } catch (err) {
    if (!(err instanceof Error && err.message.includes("EEXIST"))) {
      process.exit(1);
    }
  }

  const project = new Project({
    tsConfigFilePath: "tsconfig.json"
  });

  const entitiesFile = project.getSourceFile("src/entities/allEntities.ts");
  const allEntities = entitiesFile
    ?.getExportedDeclarations()
    .get("allEntities");

  if (!allEntities) {
    console.error("Failed to find entities export");
    process.exit(1);
  }
  const allEntityTypeSignatures: EntityTypeSignature[] = [];

  const arrVal = allEntities[0]
    .getLastChildByKind(SyntaxKind.ArrayLiteralExpression)
    ?.getLastChildByKind(SyntaxKind.SyntaxList);
  for (const child of arrVal?.getChildren() ?? []) {
    if (!child.isKind(SyntaxKind.Identifier)) continue;
    const definition = child.getDefinitions().at(0);
    if (!definition) continue;
    const clazzDef = definition.getDeclarationNode();
    if (!clazzDef?.isKind(SyntaxKind.ClassDeclaration)) continue;
    const clazzTypeName = clazzDef
      .getStaticMember("type")
      ?.getDescendantsOfKind(SyntaxKind.StringLiteral)
      .at(0)
      ?.getLiteralValue();
    if (!clazzTypeName) continue;
    const clazzConstructorParameter = clazzDef
      .getConstructors()
      .at(0)
      ?.getParameters()
      .at(0);
    if (!clazzConstructorParameter) continue;

    const constructorArgs: EntityArgEntry[] = [];

    // Extract default values from the constructor body's destructuring of props.
    // e.g. `const { facingRight = true, scale = 1 } = props;`
    const defaultValues = new Map<string, string | number | boolean>();
    const constructorBody = clazzDef.getConstructors().at(0)?.getBody();
    if (constructorBody) {
      for (const stmt of constructorBody.getDescendantsOfKind(
        SyntaxKind.VariableDeclaration
      )) {
        const binding = stmt.getFirstChildByKind(
          SyntaxKind.ObjectBindingPattern
        );
        if (!binding) continue;
        // Check if the initializer references the constructor parameter
        const init = stmt.getInitializer();
        const paramName = clazzConstructorParameter.getName();
        if (!init || init.getText() !== paramName) continue;
        for (const element of binding.getElements()) {
          const elemInit = element.getInitializer();
          if (!elemInit) continue;
          const propName =
            element.getPropertyNameNode()?.getText() ?? element.getName();
          const text = elemInit.getText();
          if (elemInit.isKind(SyntaxKind.NumericLiteral)) {
            defaultValues.set(propName, parseFloat(text));
          } else if (
            elemInit.isKind(SyntaxKind.TrueKeyword) ||
            elemInit.isKind(SyntaxKind.FalseKeyword)
          ) {
            defaultValues.set(propName, text === "true");
          } else if (
            elemInit.isKind(SyntaxKind.StringLiteral) ||
            elemInit.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)
          ) {
            defaultValues.set(propName, elemInit.getLiteralValue() as string);
          }
          // Skip complex default values (function calls, objects, etc.)
        }
      }
    }

    for (const propSymbol of clazzConstructorParameter
      .getType()
      .getApparentProperties()) {
      const propValueDec = propSymbol
        .getValueDeclaration()
        ?.asKind(SyntaxKind.PropertySignature);
      if (!propValueDec) continue;

      const propName = propSymbol.getName();
      const declaredTypeNode = propValueDec.getTypeNode();
      // The Type API resolves aliased unions a syntax walk would miss.
      const propType = propSymbol.getTypeAtLocation(propValueDec);
      const schema: ValueSchema | undefined = isTiledObjectRefTypeNode(
        declaredTypeNode
      )
        ? { kind: "entityRef" }
        : extractValueSchema(
            propType,
            { locationNode: propValueDec, expanding: new Set() },
            0
          );

      const entry: EntityArgEntry = {
        name: propName,
        type: declaredTypeNode?.getText() ?? schema?.kind ?? "unknown",
        optional: propValueDec.hasQuestionToken()
      };
      if (defaultValues.has(propName)) {
        entry.defaultValue = defaultValues.get(propName)!;
      }
      if (schema) entry.schema = schema;
      constructorArgs.push(entry);
    }

    const jsDocs = clazzDef.getJsDocs();
    const docString = jsDocs.length
      ? jsDocs.map((d) => d.print()).join("\n")
      : undefined;

    const filePath = path.parse(clazzDef.getSourceFile().getFilePath());
    const dirName = filePath.dir.match(/src\/?(.|\/)*/)?.[0];
    const fullImportName = path.join(dirName ?? "", filePath.name);

    allEntityTypeSignatures.push({
      name: clazzTypeName,
      docString,
      sourceFile: fullImportName,
      args: constructorArgs
    });
  }

  const allTypeSignaturesStr = JSON.stringify(allEntityTypeSignatures, null, 2);
  fs.writeFileSync(
    path.join(kOutputDirectory, "allEntitiesMetadata.json"),
    allTypeSignaturesStr,
    {
      encoding: "utf8"
    }
  );

  const entityTypeNames = allEntityTypeSignatures
    .map((signature) => signature.name)
    .sort();
  const entityTypeNamesSource = [
    "// Generated by scripts/ts/document-entities.ts. Do not edit by hand.",
    "export type EntityTypeName =",
    ...entityTypeNames.map(
      (typeName, index) =>
        `  | ${JSON.stringify(typeName)}${
          index === entityTypeNames.length - 1 ? ";" : ""
        }`
    ),
    ""
  ].join("\n");
  fs.writeFileSync(
    path.join(kOutputDirectory, "entityTypeNames.ts"),
    entityTypeNamesSource,
    { encoding: "utf8" }
  );
}

run();
