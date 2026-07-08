import { Component } from 'react';

/* Перехватывает ошибки рендера в дереве компонентов и показывает запасной экран,
   чтобы единичный сбой (например 3D-сцена на старом GPU) не ронял весь сайт. */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // В проде сюда можно подключить отправку в Sentry/лог-сервис
    console.error('UI error:', error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <div className="eb-screen">
          <div className="eb-card">
            <div className="eb-logo">DDC</div>
            <h1>Что-то пошло не так</h1>
            <p>Страница столкнулась с непредвиденной ошибкой. Попробуйте перезагрузить.</p>
            <button className="eb-btn" onClick={this.handleReload}>Перезагрузить</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
