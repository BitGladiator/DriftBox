export const light = {
    bg: '#ffffff',
    bgSecondary: '#f7f6f3',
    bgHover: '#efefef',
    border: '#e8e8e6',
    text: '#1a1a1a',
    textSecondary: '#6b6b6b',
    textMuted: '#9b9b9b',
  };
  
  export const dark = {
    bg: '#191919',
    bgSecondary: '#222222',
    bgHover: '#2e2e2e',
    border: '#333333',
    text: '#e8e8e6',
    textSecondary: '#9b9b9b',
    textMuted: '#6b6b6b',
  };
  
  export type Theme = typeof light;
  
  export const getTheme = (isDark: boolean): Theme => (isDark ? dark : light);
  
  export const accent = {
    blue: '#2383e2',
    blueMuted: '#93c5fd',
    purple: '#9065b0',
    green: '#0f7b6c',
    red: '#eb5757',
    yellow: '#dfab01',
    orange: '#d9730d',
  };