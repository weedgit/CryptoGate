import assert from "node:assert/strict";
import { describe, it } from "node:test";

function looksLikeEmailQuery(query) {
  return query.trim().includes("@");
}

/** Mirrors useAutoSelectOrgListRow decision logic for unit tests. */
function shouldAutoSelect(input) {
  const {
    loading,
    selectedId,
    allIds,
    filteredIds,
    emailIndexLoading,
    query,
  } = input;
  if (loading) return null;
  if (looksLikeEmailQuery(query) && emailIndexLoading) return null;
  if (filteredIds.length === 0) return null;

  const firstId = filteredIds[0];
  const selectionKnown = selectedId != null && allIds.includes(selectedId);
  const selectionVisible =
    selectionKnown && filteredIds.includes(selectedId);

  if (selectionVisible) return null;
  return firstId;
}

describe("useAutoSelectOrgListRow logic", () => {
  const all = ["a", "b", "c"];

  it("selects first row when nothing is selected", () => {
    assert.equal(
      shouldAutoSelect({
        loading: false,
        allIds: all,
        filteredIds: all,
        emailIndexLoading: false,
        query: "",
      }),
      "a",
    );
  });

  it("keeps a visible selection", () => {
    assert.equal(
      shouldAutoSelect({
        loading: false,
        selectedId: "b",
        allIds: all,
        filteredIds: all,
        emailIndexLoading: false,
        query: "",
      }),
      null,
    );
  });

  it("reselects when filters hide the current row", () => {
    assert.equal(
      shouldAutoSelect({
        loading: false,
        selectedId: "c",
        allIds: all,
        filteredIds: ["a", "b"],
        emailIndexLoading: false,
        query: "",
      }),
      "a",
    );
  });

  it("reselects when the URL id is invalid", () => {
    assert.equal(
      shouldAutoSelect({
        loading: false,
        selectedId: "missing",
        allIds: all,
        filteredIds: all,
        emailIndexLoading: false,
        query: "",
      }),
      "a",
    );
  });

  it("waits while email search index is loading", () => {
    assert.equal(
      shouldAutoSelect({
        loading: false,
        allIds: all,
        filteredIds: all,
        emailIndexLoading: true,
        query: "owner@example.com",
      }),
      null,
    );
  });
});
