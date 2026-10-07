import * as yup from "yup";

import { IVector2 } from "src/engine/util/vecTypes";
import { autoTranslateClass, exposeProp } from "src/scripting/core/Bindings";

const numSchema = yup.number();
const numValidator = (data: unknown) => numSchema.validateSync(data);

const iVector2Schema = yup
  .object({
    x: yup.number().required(),
    y: yup.number().required()
  })
  .strict();
const iVector2Vaidator = (data: unknown) => iVector2Schema.validateSync(data);

type PartialVector2 = Partial<IVector2>;
type SpellVectorConstructorArg1 = number | number[] | PartialVector2;
function isSpellVectorConstructorArg1(
  value: unknown
): value is SpellVectorConstructorArg1 {
  if (value === undefined || value === null) return false;
  if (typeof value === "number") return true;
  if (typeof value === "object") {
    if (Array.isArray(value))
      return value.every((vv: unknown) => typeof vv === "number");
    return true;
  }
  return false;
}

const vector2ConstructorSchema = yup
  .mixed()
  .test(
    "valid-type",
    "The Vector constructor accepts two numbers, an object with optional x any y number attributes, or an array.",
    isSpellVectorConstructorArg1
  );
export const vector2ConstructorValidator = (arg: unknown) =>
  vector2ConstructorSchema.validateSync(arg);

@autoTranslateClass({
  name: "Vector",
  constructorValidator: vector2ConstructorValidator
})
export class SpellVector {
  @exposeProp({ validator: numValidator })
  public x = 0;

  @exposeProp({ validator: numValidator })
  public y = 0;

  constructor(xOrObj: number | number[] | PartialVector2 = 0, y = 0) {
    if (typeof xOrObj === "object") {
      if (Array.isArray(xOrObj)) {
        this.x = Number(xOrObj.at(0) ?? 0);
        this.y = Number(xOrObj.at(1) ?? 0);
      } else {
        const asVector2 = xOrObj as PartialVector2;
        this.x = Number(asVector2.x ?? 0);
        this.y = Number(asVector2.y ?? 0);
      }
    } else {
      this.x = Number(xOrObj);
      this.y = Number(y);
    }
    if (Number.isNaN(this.x)) this.x = 0;
    if (Number.isNaN(this.y)) this.y = 0;
  }

  @exposeProp({ synch: true })
  public clone() {
    return new SpellVector(this.x, this.y);
  }

  @exposeProp({ synch: true, validator: iVector2Vaidator })
  public add(other: IVector2) {
    this.x += other.x;
    this.y += other.y;
    return this;
  }

  @exposeProp({ synch: true, validator: iVector2Vaidator })
  public sub(other: IVector2) {
    this.x -= other.x;
    this.y -= other.y;
    return this;
  }

  @exposeProp({ synch: true, validator: numValidator })
  public scale(scale: number) {
    this.x *= scale;
    this.y *= scale;
    return this;
  }

  @exposeProp({ synch: true, validator: numValidator })
  public rotate(rotation: number) {
    const dx = Math.cos(rotation);
    const dy = Math.sin(rotation);
    const { x, y } = this;
    this.x = x * dx - y * dy;
    this.y = y * dx + x * dy;
    return this;
  }

  @exposeProp({ synch: true })
  public length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  @exposeProp({ synch: true, validator: iVector2Vaidator })
  public dot(other: IVector2) {
    return this.x * other.x + this.y * other.y;
  }

  @exposeProp({ synch: true })
  public normalize() {
    const len = this.length();
    if (len === 0) {
      this.x = 1;
      this.y = 0;
      return this;
    }
    this.x /= len;
    this.y /= len;
    return this;
  }

  @exposeProp({ synch: true })
  public angle() {
    return Math.atan2(this.y, this.x);
  }

  @exposeProp({ synch: true })
  public round(radix = 1) {
    this.x = Math.round(this.x / radix) * radix;
    this.y = Math.round(this.y / radix) * radix;
    return this;
  }
}
