/// <reference types="react" />
/// <reference types="react-dom" />

declare namespace React {
  interface JSX {
    // Allow any element
    [elemName: string]: any;
  }
} 