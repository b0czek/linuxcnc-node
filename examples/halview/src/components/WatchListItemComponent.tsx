import React from 'react';
import { WatchListItem, HalItemData } from '../../electron/types';
import { formatDisplayValue } from '../utils/formatters'; 
import styles from '../styles/WatchView.module.css'; 

interface WatchListItemProps {
  item: WatchListItem;
  onRemove: (itemName: string) => void;
  onShowTooltip: (itemData: HalItemData, event: React.MouseEvent) => void;
  onHideTooltip: () => void;
  onSetValue: (itemName: string, itemType: 'pin' | 'param' | 'signal', currentValue: any) => void;
}

const WatchListItemComponent: React.FC<WatchListItemProps> = ({
  item,
  onRemove,
  onShowTooltip,
  onHideTooltip,
  onSetValue,
}) => {
  const handleMouseEnter = (e: React.MouseEvent) => {
    if (item.details) {
      onShowTooltip(item.details, e);
    } else {
      // If details are not pre-loaded, App.tsx could fetch them on demand via IPC.
      // For now, assume details are part of WatchListItem if needed for tooltip.
      // For simplicity, we'll rely on item.details being present.
    }
  };

  return (
    <div
      className={styles.watchListItem}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onHideTooltip}
    >
      <span className={styles.watchItemName} title={item.name}>{item.name}</span>
      <span className={styles.watchItemValue}>
        {formatDisplayValue(item.value, item.dataTypeName)}
      </span>
      <div className={styles.watchItemActions}>
        {item.isWritable && (
          <button onClick={() => onSetValue(item.name, item.type, item.value)} title="Set Value">
            Set
          </button>
        )}
        <button onClick={() => onRemove(item.name)} title="Remove">
          ✕
        </button>
      </div>
    </div>
  );
};

export default WatchListItemComponent;