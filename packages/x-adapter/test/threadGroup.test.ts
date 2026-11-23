import test from "node:test";
import assert from "node:assert/strict";
import {
  partitionThreadGroups,
  resolveThreadGroup,
  type ThreadNodeInput,
} from "../src/threadGroup.ts";
import type { Decision } from "../../engine/src/types.ts";

function makeDecision(postId: string, action: Decision["action"], score: number): Decision {
  return {
    postId,
    action,
    score,
    reasons: [],
    evaluatedAt: Date.now(),
  };
}

function makeNode(overrides: Partial<ThreadNodeInput> & { postId: string }): ThreadNodeInput {
  return {
    authorHandle: "alice",
    containerKey: "c1",
    visualOrder: 0,
    domIndex: 0,
    connectsUp: false,
    connectsDown: false,
    replyingToHandles: [],
    gapFromPrevPx: null,
    ...overrides,
  };
}

test("partitionThreadGroups groups parent and reply connected by vertical thread lines even when DOM order is virtualized", () => {
  const nodes: ThreadNodeInput[] = [
    // Virtualized DOM order puts reply before parent, but visualOrder puts parent (100px) above reply (320px)
    makeNode({
      postId: "reply-1",
      authorHandle: "bob",
      visualOrder: 320,
      domIndex: 0,
      connectsUp: true,
    }),
    makeNode({
      postId: "orig-1",
      authorHandle: "alice",
      visualOrder: 100,
      domIndex: 1,
      connectsDown: true,
    }),
    makeNode({
      postId: "unrelated-1",
      authorHandle: "carol",
      visualOrder: 640,
      domIndex: 2,
    }),
  ];

  const groups = partitionThreadGroups(nodes);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups[0].map((n) => n.postId),
    ["orig-1", "reply-1"],
  );
  assert.deepEqual(
    groups[1].map((n) => n.postId),
    ["unrelated-1"],
  );
});

test("partitionThreadGroups links adjacent posts via Replying to @prevAuthor or remembered peers after hiding", () => {
  const byReply = partitionThreadGroups([
    makeNode({ postId: "orig-2", authorHandle: "alice", visualOrder: 0, domIndex: 0 }),
    makeNode({
      postId: "reply-2",
      authorHandle: "bob",
      visualOrder: 200,
      domIndex: 1,
      replyingToHandles: ["alice"],
      gapFromPrevPx: 2,
    }),
  ]);
  assert.equal(byReply.length, 1);
  assert.deepEqual(
    byReply[0].map((n) => n.postId),
    ["orig-2", "reply-2"],
  );

  // Even after connector DOM is hidden, remembered peer map keeps them grouped
  const peers = new Map<string, Set<string>>([
    ["orig-3", new Set(["reply-3"])],
    ["reply-3", new Set(["orig-3"])],
  ]);
  const byPeers = partitionThreadGroups(
    [
      makeNode({ postId: "orig-3", authorHandle: "alice", visualOrder: 0, domIndex: 0 }),
      makeNode({ postId: "reply-3", authorHandle: "bob", visualOrder: 0, domIndex: 1 }),
    ],
    peers,
  );
  assert.equal(byPeers.length, 1);
});

test("resolveThreadGroup removes original post and filtered reply together, and expands both on Show", () => {
  const members = [
    {
      item: "orig",
      postId: "orig-1",
      decision: makeDecision("orig-1", "show", 0.5),
      isFocalPost: false,
      isUserExpanded: false,
    },
    {
      item: "reply",
      postId: "reply-1",
      decision: makeDecision("reply-1", "collapse", -4.2),
      isFocalPost: false,
      isUserExpanded: false,
    },
  ];

  const filtered = resolveThreadGroup(members);
  assert.equal(filtered.isFiltered, true);
  assert.equal(filtered.groupSize, 2);
  assert.equal(filtered.primaryFiltered?.postId, "reply-1");

  // Expanding any member expands the whole thread together
  const expanded = resolveThreadGroup([
    members[0],
    { ...members[1], isUserExpanded: true },
  ]);
  assert.equal(expanded.isFiltered, false);
  assert.equal(expanded.isExpanded, true);
});
