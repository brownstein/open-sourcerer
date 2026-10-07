import { InterpreterObject } from "js-interpreter";

import { autoTranslateClass, bindObjectProperty, exposeProp } from "./Bindings";
import { JSRunner } from "./JsRunner";
import { delay } from "./util";

describe("Bindings / bindObjectProperty", () => {
  test("binds an object property and correctly surfaces it to console.", async () => {
    const runner = new JSRunner();
    const interpreter = runner.interpreter;
    const obj = {
      a: 1,
      get b() {
        return 2;
      }
    };
    runner.appendRawES5("var a = {};", true);
    await runner.run();
    const a = interpreter.getProperty(
      interpreter.getGlobalScope().object,
      "a"
    ) as InterpreterObject;
    bindObjectProperty(interpreter, obj, a, "a");
    bindObjectProperty(interpreter, obj, a, "b");
    let consoleOutputObj: unknown;
    runner.events.on(
      "consoleLog",
      (value) => (consoleOutputObj = value.objectValue)
    );
    runner.appendRawES5("console.log(a);", true);
    await runner.run();
    expect(obj).toEqual(consoleOutputObj);
    runner.appendRawES5("console.log(a);", true);
    obj.a = 3;
    await runner.run();
    expect(obj).toEqual(consoleOutputObj);
  });
});

describe("Bindings / PseudoTranslator", () => {
  it("Correctly translates primatives", async () => {
    const runner = new JSRunner();
    const interpreter = runner.interpreter;
    const translate = runner.translate;

    const getProp = (name: string) => {
      const val = interpreter.getProperty(
        interpreter.getGlobalScope().object,
        name
      );
      return translate.pseudoToNative(val);
    };

    const setProp = (name: string, value: unknown) => {
      const val = translate.nativeToPseudo(value);
      interpreter.setProperty(interpreter.getGlobalScope().object, name, val);
    };

    await runner.transpileAndAppendES6(`
      const a = true;
      const b = 1;
      const c = "two";
      const d = null;
      const e = undefined;  
    `);
    await runner.run();

    expect(getProp("a")).toEqual(true);
    expect(getProp("b")).toEqual(1);
    expect(getProp("c")).toEqual("two");
    expect(getProp("d")).toEqual(null);
    expect(getProp("3")).toEqual(undefined);

    setProp("f", false);
    setProp("g", 2);
    setProp("h", "three");
    setProp("i", null);
    setProp("j", undefined);

    expect(getProp("f")).toEqual(false);
    expect(getProp("g")).toEqual(2);
    expect(getProp("h")).toEqual("three");
    expect(getProp("i")).toEqual(null);
    expect(getProp("j")).toEqual(undefined);
  });

  it("Correctly translates POJOs", async () => {
    const runner = new JSRunner();
    const interpreter = runner.interpreter;
    const translate = runner.translate;

    const getProp = (name: string) => {
      const val = interpreter.getProperty(
        interpreter.getGlobalScope().object,
        name
      );
      return translate.pseudoToNative(val);
    };

    const setProp = (name: string, value: unknown) => {
      const val = translate.nativeToPseudo(value);
      interpreter.setProperty(interpreter.getGlobalScope().object, name, val);
    };

    await runner.transpileAndAppendES6(`
      const anObject = {
        a: true,
        b: 1,
        c: {
          d: 10
        }
      };  
    `);
    await runner.run();

    const anObject = getProp("anObject");
    expect(anObject).toEqual({
      a: true,
      b: 1,
      c: {
        d: 10
      }
    });

    const anotherObject = {
      nested: {
        fields: ["work", "as", "expected"]
      }
    };

    setProp("anotherObject", anotherObject);

    // We're mutating an object property that's been bound for read
    // directly - we expect this property to be correctly proxied
    // when read by the environment.
    anotherObject.nested.fields.push("now");

    await runner.transpileAndAppendES6(`
      anotherObject.nested.pseudoValue = 10;
      const workAsExpected = anotherObject.nested.fields;
    `);
    await runner.run();

    // We mutated the object in the interpreter. We want to ensure
    // that the result of that mutation is present in output.
    expect(getProp("anotherObject")).toEqual({
      ...anotherObject,
      nested: {
        ...anotherObject.nested,
        pseudoValue: 10
      }
    });
    expect(getProp("workAsExpected")).toEqual([
      "work",
      "as",
      "expected",
      "now"
    ]);
  });

  it("Correctly translates functions", async () => {
    const runner = new JSRunner();
    const interpreter = runner.interpreter;
    const translate = runner.translate;

    const getProp = (name: string) => {
      const val = interpreter.getProperty(
        interpreter.getGlobalScope().object,
        name
      );
      return translate.pseudoToNative(val);
    };

    const setProp = (name: string, value: unknown) => {
      const val = translate.nativeToPseudo(value);
      interpreter.setProperty(interpreter.getGlobalScope().object, name, val);
    };

    let runMeRuns = 0;
    const runMe = () => {
      runMeRuns++;
      return runMeRuns;
    };

    let andWaitForMeData: number[] = [];
    const andWaitForMe = async (data: number) => {
      andWaitForMeData.push(data);
      await delay(100);
      return "woo";
    };

    setProp("runMe", runMe);
    setProp("andWaitForMe", andWaitForMe);

    await runner.transpileAndAppendES6(`
      runMe()
      const two = runMe();
      const woo = andWaitForMe(two);
    `);
    await runner.run();

    expect(runMeRuns).toEqual(2);
    expect(andWaitForMeData).toEqual([2]);

    expect(getProp("woo")).toEqual("woo");
  });

  @autoTranslateClass({ name: "AutoMap" })
  class AutoMap {
    @exposeProp({})
    public foo = 1;

    @exposeProp({})
    public bar(input: number) {
      this.foo += input;
    }

    @exposeProp({ synch: true })
    public get baz() {
      return this.foo * 2;
    }

    private bad() {
      this.foo = -1;
      throw new Error("BAD!");
    }
  }

  it("Correctly auto-translates the AutoMap class", async () => {
    const runner = new JSRunner();
    const interpreter = runner.interpreter;
    const translate = runner.translate;

    const getProp = (name: string) => {
      const val = interpreter.getProperty(
        interpreter.getGlobalScope().object,
        name
      );
      return translate.pseudoToNative(val);
    };

    const setProp = (name: string, value: unknown) => {
      const val = translate.nativeToPseudo(value);
      interpreter.setProperty(interpreter.getGlobalScope().object, name, val);
    };

    const extantMap = new AutoMap();
    setProp("AutoMap", AutoMap);
    setProp("extantMap", extantMap);

    await runner.transpileAndAppendES6(`
      const foo = extantMap.foo;
      extantMap.bar(2);
      const baz = extantMap.baz;
      const newMap = new AutoMap();
      const newBaz = newMap.baz;
      var caught;
      try {
        newMap.bad();
      } catch (err) {
        caught = err.message;
      }
    `);
    await runner.run();

    expect(getProp("foo")).toEqual(1);
    expect(getProp("baz")).toEqual(6);
    expect(extantMap.foo).toEqual(3);
    expect(getProp("newMap") instanceof AutoMap).toBeTruthy();
    expect(getProp("caught")).toEqual("newMap.bad is not a function");
  });
});
