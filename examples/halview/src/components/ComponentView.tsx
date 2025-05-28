import React from 'react';
import { FullHalData, HalItemData } from '../../electron/types';
import styles from '../styles/ComponentView.module.css';

interface ComponentViewProps {
  halData: FullHalData | null;
  componentName: string | null;
  onAddToWatchList: (itemData: HalItemData) => void;
  onShowTooltip: (itemData: HalItemData, event: React.MouseEvent) => void;
  onHideTooltip: () => void;
  onBackToTree: () => void;
}

const ComponentView: React.FC<ComponentViewProps> = ({
  halData,
  componentName,
  onAddToWatchList,
  onShowTooltip,
  onHideTooltip,
  onBackToTree,
}) => {
  if (!componentName || !halData) {
    return (
      <div className={styles.componentViewContainer}>
        <p>No component selected or data not loaded.</p>
        <button onClick={onBackToTree}>Back to Tree</button>
      </div>
    );
  }

  const pins = halData.pins.filter(p => p.name.startsWith(componentName + '.'));
  const params = halData.params.filter(p => p.name.startsWith(componentName + '.'));

  const renderItem = (item: HalItemData, type: 'pin' | 'param') => (
    <li
      key={item.name}
      onDoubleClick={() => onAddToWatchList(item)}
      onMouseEnter={(e) => onShowTooltip(item, e)}
      onMouseLeave={onHideTooltip}
      title={item.name}
    >
      {item.name.substring(componentName.length + 1)} {/* Show only suffix */}
    </li>
  );

  return (
    <div className={styles.componentViewContainer}>
      <button onClick={onBackToTree} className={styles.backButton}>
        ← Back to Tree
      </button>
      <h3>Component: {componentName}</h3>

      <h4>Pins ({pins.length})</h4>
      {pins.length > 0 ? (
        <ul>{pins.map(pin => renderItem(pin, 'pin'))}</ul>
      ) : (
        <p className={styles.noItems}>No pins found for this component.</p>
      )}

      <h4>Parameters ({params.length})</h4>
      {params.length > 0 ? (
        <ul>{params.map(param => renderItem(param, 'param'))}</ul>
      ) : (
        <p className={styles.noItems}>No parameters found for this component.</p>
      )}
    </div>
  );
};

export default ComponentView;