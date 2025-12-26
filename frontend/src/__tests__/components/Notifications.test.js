import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Notifications from '../../components/Notifications';
import { AppProvider, useApp } from '../../context/AppContext';

// Test component that can trigger notifications
const TestNotificationTrigger = () => {
  const { showSuccess, showError, showWarning, showInfo } = useApp();

  return (
    <div>
      <button onClick={() => showSuccess('Success!')}>Show Success</button>
      <button onClick={() => showError('Error!')}>Show Error</button>
      <button onClick={() => showWarning('Warning!')}>Show Warning</button>
      <button onClick={() => showInfo('Info!')}>Show Info</button>
    </div>
  );
};

const renderWithProvider = () => {
  return render(
    <AppProvider>
      <Notifications />
      <TestNotificationTrigger />
    </AppProvider>
  );
};

describe('Notifications', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should render nothing when no notifications', () => {
    render(
      <AppProvider>
        <Notifications />
      </AppProvider>
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should display success notification', () => {
    renderWithProvider();

    fireEvent.click(screen.getByText('Show Success'));

    expect(screen.getByText('Success!')).toBeInTheDocument();
    expect(document.querySelector('.notification-success')).toBeInTheDocument();
  });

  it('should display error notification', () => {
    renderWithProvider();

    fireEvent.click(screen.getByText('Show Error'));

    expect(screen.getByText('Error!')).toBeInTheDocument();
    expect(document.querySelector('.notification-error')).toBeInTheDocument();
  });

  it('should display warning notification', () => {
    renderWithProvider();

    fireEvent.click(screen.getByText('Show Warning'));

    expect(screen.getByText('Warning!')).toBeInTheDocument();
    expect(document.querySelector('.notification-warning')).toBeInTheDocument();
  });

  it('should display info notification', () => {
    renderWithProvider();

    fireEvent.click(screen.getByText('Show Info'));

    expect(screen.getByText('Info!')).toBeInTheDocument();
    expect(document.querySelector('.notification-info')).toBeInTheDocument();
  });

  it('should close notification when close button clicked', () => {
    renderWithProvider();

    fireEvent.click(screen.getByText('Show Success'));
    expect(screen.getByText('Success!')).toBeInTheDocument();

    const closeButton = document.querySelector('.notification-close');
    fireEvent.click(closeButton);

    expect(screen.queryByText('Success!')).not.toBeInTheDocument();
  });

  it('should display multiple notifications', () => {
    renderWithProvider();

    fireEvent.click(screen.getByText('Show Success'));
    fireEvent.click(screen.getByText('Show Error'));

    expect(screen.getByText('Success!')).toBeInTheDocument();
    expect(screen.getByText('Error!')).toBeInTheDocument();
  });

  it('should auto-remove notifications after timeout', () => {
    renderWithProvider();

    fireEvent.click(screen.getByText('Show Success'));
    expect(screen.getByText('Success!')).toBeInTheDocument();

    // Default duration is 5000ms for success
    jest.advanceTimersByTime(5000);

    expect(screen.queryByText('Success!')).not.toBeInTheDocument();
  });
});
