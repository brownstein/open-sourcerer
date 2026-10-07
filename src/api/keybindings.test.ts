import {
  DEFAULT_KEYBINDINGS,
  GameControlActions,
  keyDisplayName,
  resolveKeyBindings
} from "./keybindings";

describe("resolveKeyBindings", () => {
  it("returns defaults unchanged with no overrides", () => {
    expect(resolveKeyBindings({})).toEqual(DEFAULT_KEYBINDINGS);
  });

  it("substitutes overridden keys while preserving other binding fields", () => {
    const resolved = resolveKeyBindings({
      [GameControlActions.MoveLeft]: ["j"]
    });
    const moveLeft = resolved.find(
      (binding) => binding.action === GameControlActions.MoveLeft
    );
    expect(moveLeft?.keys).toEqual(["j"]);
    const moveRight = resolved.find(
      (binding) => binding.action === GameControlActions.MoveRight
    );
    expect(moveRight?.keys).toEqual(["d", "ArrowRight"]);
  });

  it("supports clearing an action entirely via an empty override", () => {
    const resolved = resolveKeyBindings({
      [GameControlActions.Interact]: []
    });
    const interact = resolved.find(
      (binding) => binding.action === GameControlActions.Interact
    );
    expect(interact?.keys).toEqual([]);
  });

  it("adds bindings for actions with no default entry", () => {
    const resolved = resolveKeyBindings({
      [GameControlActions.Attack]: ["f"]
    });
    const attack = resolved.find(
      (binding) => binding.action === GameControlActions.Attack
    );
    expect(attack?.keys).toEqual(["f"]);
  });

  it("never remaps hotbar bindings", () => {
    const resolved = resolveKeyBindings({
      [GameControlActions.UseHotbar]: ["x"]
    });
    const hotbarBindings = resolved.filter(
      (binding) => binding.action === GameControlActions.UseHotbar
    );
    expect(hotbarBindings).toHaveLength(10);
    expect(hotbarBindings.map((binding) => binding.keys[0])).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "0"
    ]);
  });
});

describe("keyDisplayName", () => {
  it("names special keys", () => {
    expect(keyDisplayName(" ")).toBe("Space");
    expect(keyDisplayName("ArrowLeft")).toBe("←");
    expect(keyDisplayName("escape")).toBe("Esc");
  });

  it("uppercases single characters", () => {
    expect(keyDisplayName("a")).toBe("A");
    expect(keyDisplayName("]")).toBe("]");
  });
});
