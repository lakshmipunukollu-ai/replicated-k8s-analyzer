'use client';

import { Component, type ReactNode } from 'react';
import AlertSummaryBar from './AlertSummaryBar';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Catches render errors from AlertSummaryBar so the rest of the page still loads. */
export default class SafeAlertSummaryBar extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn('[SafeAlertSummaryBar] AlertSummaryBar failed:', error);
  }

  render() {
    if (this.state.hasError) return null;
    return <AlertSummaryBar />;
  }
}
