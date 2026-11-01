"use client";

import { Component, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";

function ErrorContent({ label }: { label?: string }) {
  const { t } = useI18n();
  return <div className="empty-state" role="alert">
    <h2>{t(label ?? "This section is temporarily unavailable.")}</h2>
    <p>{t("Please refresh the page to try again.")}</p>
  </div>;
}

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
      return this.props.fallback ?? <ErrorContent label={this.props.label} />;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
