import { describe, expect, it } from "vitest";
import { applyReaction, shouldRemoveComment } from "./commentReactions";

const empty = { likes: [], dislikes: [] };

describe("applyReaction", () => {
  it("adds a like", () => {
    expect(applyReaction(empty, "u1", "like")).toEqual({ likes: ["u1"], dislikes: [] });
  });

  it("toggles the same reaction off", () => {
    expect(applyReaction({ likes: ["u1"], dislikes: [] }, "u1", "like")).toEqual(empty);
    expect(applyReaction({ likes: [], dislikes: ["u1"] }, "u1", "dislike")).toEqual(empty);
  });

  it("switching reaction removes the other one", () => {
    expect(applyReaction({ likes: ["u1"], dislikes: [] }, "u1", "dislike")).toEqual({ likes: [], dislikes: ["u1"] });
    expect(applyReaction({ likes: [], dislikes: ["u1"] }, "u1", "like")).toEqual({ likes: ["u1"], dislikes: [] });
  });

  it("leaves other users untouched", () => {
    expect(applyReaction({ likes: ["u2"], dislikes: ["u3"] }, "u1", "dislike")).toEqual({
      likes: ["u2"],
      dislikes: ["u3", "u1"],
    });
  });

  it("does not mutate its input", () => {
    const state = { likes: ["u1"], dislikes: [] as string[] };
    applyReaction(state, "u1", "dislike");
    expect(state).toEqual({ likes: ["u1"], dislikes: [] });
  });
});

describe("shouldRemoveComment", () => {
  it("removes at two dislikes, not one", () => {
    expect(shouldRemoveComment({ likes: [], dislikes: ["a"] })).toBe(false);
    expect(shouldRemoveComment({ likes: [], dislikes: ["a", "b"] })).toBe(true);
  });

  it("the same user disliking twice un-dislikes, so it never removes", () => {
    const once = applyReaction(empty, "a", "dislike");
    const twice = applyReaction(once, "a", "dislike");
    expect(shouldRemoveComment(twice)).toBe(false);
  });
});
