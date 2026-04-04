export class BTreeValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'BTreeValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BTreeInvariantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'BTreeInvariantError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BTreeConcurrencyError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'BTreeConcurrencyError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
