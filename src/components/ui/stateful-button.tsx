import React, { useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'none';

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  variant?: ButtonVariant;
  loading?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => Promise<void> | void;
  children: React.ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  success: 'btn-success',
  ghost: 'btn-ghost',
  none: 'btn',
};

export function Button({
  variant = 'primary',
  loading: externalLoading,
  disabled,
  onClick,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const [internalLoading, setInternalLoading] = useState(false);
  const isLoading = externalLoading ?? internalLoading;

  const handleClick = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isLoading || disabled) return;
      if (!onClick) return;

      const result = onClick(e);
      if (result instanceof Promise) {
        setInternalLoading(true);
        try {
          await result;
        } finally {
          setInternalLoading(false);
        }
      }
    },
    [isLoading, disabled, onClick],
  );

  return (
    <button
      disabled={disabled || isLoading}
      className={`${variantClass[variant]} flex items-center gap-2 ${className}`}
      onClick={handleClick}
      {...props}
    >
      {isLoading && <Loader2 size={14} className="animate-spin shrink-0" />}
      {children}
    </button>
  );
}
