// Test to verify if empty array matches RelationPaths<T> type
type RelationPaths<T> = Array<string>;

function testFunc(relations?: RelationPaths<string>): void {
  // Empty array should be valid
}

// This should compile fine
testFunc([]);
testFunc(undefined);
testFunc();
