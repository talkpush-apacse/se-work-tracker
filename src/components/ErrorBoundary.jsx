import { Component } from 'react';

/**
 * Root error boundary — catches render-time exceptions anywhere in the tree
 * and shows a recoverable fallback UI instead of a blank white screen.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // In production this goes to the browser console (not dropped by esbuild
    // because we only strip console.log/debug, not console.error).
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-background px-4">
          <div className="max-w-sm w-full text-center">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-destructive text-xl">!</span>
            </div>
            <h2 className="text-base font-semibold text-foreground mb-1">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mb-1">
              {this.state.error.message || 'An unexpected error occurred.'}
            </p>
            <p className="text-xs text-muted-foreground/60 mb-5">
              Your data is safe — this is a display error only.
            </p>
            <button
              onClick={this.handleReset}
              className="text-sm font-medium text-brand-lavender hover:text-brand-lavender/80 underline underline-offset-2 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
