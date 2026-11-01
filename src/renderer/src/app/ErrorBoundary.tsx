import { Component, type ReactNode } from 'react'
import { ErrorState } from '@renderer/components/ui'

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (this.state.error)
      return (
        <div className="p-10">
          <ErrorState title="Something went wrong on this screen." body={this.state.error.message} onRetry={() => this.setState({ error: null })} />
        </div>
      )
    return this.props.children
  }
}
