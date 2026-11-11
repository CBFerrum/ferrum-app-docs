// A small choice the browser remembers for this person (nothing where it refuses).

export function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The choice just lasts until the page closes.
  }
}
