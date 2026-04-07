/** Thrown when a caller supplies invalid input, such as a duplicate key, sequence overflow, or malformed configuration. */
export class BTreeValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'BTreeValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when an internal tree invariant is violated, indicating a bug in the library rather than invalid caller input. */
export class BTreeInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'BTreeInvariantError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the concurrent store contract is violated or a mutation batch is malformed during optimistic concurrency operations. */
export class BTreeConcurrencyError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'BTreeConcurrencyError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
