import React from 'react';

interface TooltipProps {
  content: string;
  x: number;
  y: number;
}

const Tooltip: React.FC<TooltipProps> = ({ content, x, y }) => {
  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${x + 15}px`,
    top: `${y + 10}px`,
    pointerEvents: 'none',
  };

  return (
    <div  style={style}>
      <pre>{content}</pre>
    </div>
  );
};

export default Tooltip;