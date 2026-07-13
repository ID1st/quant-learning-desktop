import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useAppRuntimeErrorStore } from "../features/feedback/appRuntimeErrorStore";

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
  readonly onRecover: () => void;
}

interface AppErrorBoundaryState {
  readonly error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    useAppRuntimeErrorStore.getState().report("render", error);
  }

  private recover = () => {
    this.setState({ error: null });
    this.props.onRecover();
  };

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="app-recovery-screen" role="alert">
        <section className="app-recovery-card">
          <span className="app-recovery-icon"><AlertTriangle size={24} /></span>
          <p>运行保护已接管</p>
          <h1>页面出现异常，但应用没有退出</h1>
          <span>已保留当前本地数据。你可以返回工作台重试，或重新加载应用恢复到干净状态。</span>
          <div className="app-recovery-actions">
            <button className="primary-auth-action" onClick={this.recover} type="button"><RotateCcw size={16} />返回工作台</button>
            <button className="secondary-action" onClick={this.reload} type="button"><RefreshCw size={16} />重新加载</button>
          </div>
        </section>
      </main>
    );
  }
}
