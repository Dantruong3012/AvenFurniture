"use client";

import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export function errorBoundaryStateFromError(): ErrorBoundaryState {
  return { hasError: true };
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return errorBoundaryStateFromError();
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="empty-state" role="alert">
          <h2>{this.props.label ?? "This section is temporarily unavailable."}</h2>
          <p>Please refresh the page to try again.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
