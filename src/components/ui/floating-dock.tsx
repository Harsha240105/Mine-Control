import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

interface DockItem {
  title: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
}

interface FloatingDockProps {
  items: DockItem[];
  className?: string;
  mobileClassName?: string;
}

export function FloatingDock({ items, className, mobileClassName }: FloatingDockProps) {
  return (
    <div className={cn('fixed bottom-6 left-1/2 -translate-x-1/2 z-50', className)}>
      <div className="flex items-end gap-2 rounded-2xl border border-surface-700/50 bg-surface-900/80 backdrop-blur-xl px-3 py-2 shadow-lg">
        {items.map((item) => (
          <DockItem key={item.title} item={item} />
        ))}
      </div>
    </div>
  );
}

function DockItem({ item }: { item: DockItem }) {
  const [hovered, setHovered] = useState(false);

  const content = (
    <motion.div
      className="relative flex flex-col items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.8 }}
            className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface-800 px-2.5 py-1 text-xs text-gray-200 border border-surface-700 shadow-lg"
          >
            {item.title}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        className="flex items-center justify-center rounded-xl p-2 text-gray-400 hover:text-minecraft-400 transition-colors cursor-pointer"
        whileHover={{ scale: 1.2 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
      >
        <div className="w-5 h-5">{item.icon}</div>
      </motion.div>
    </motion.div>
  );

  if (item.href) {
    return (
      <Link to={item.href} onClick={item.onClick}>
        {content}
      </Link>
    );
  }

  return (
    <div onClick={item.onClick} className="cursor-pointer">
      {content}
    </div>
  );
}
