import { useEffect } from 'react';
import { useThemeStore } from '../store/useThemeStore';

export const useThemeEffect = () => {
  const { theme } = useThemeStore();

  useEffect(() => {
    const body = document.body;
    const root = document.documentElement;
    body.classList.remove('light', 'dark');
    body.classList.add(theme);
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    body.setAttribute('data-theme', theme);
    root.setAttribute('data-theme', theme);
  }, [theme]);
};
