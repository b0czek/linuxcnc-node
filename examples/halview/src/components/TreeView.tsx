import React, { useState, useMemo, useEffect } from 'react';
import { TreeItem, HalItemData, FullHalData } from '../../electron/types'; 
import { buildTreeStructure } from '../utils/formatters';
import styles from '../styles/TreeView.module.css';

interface TreeViewProps {
  halData: FullHalData | null;
  filterText: string;
  onAddToWatchList: (itemData: HalItemData) => void;
  onShowTooltip: (itemData: HalItemData, event: React.MouseEvent) => void;
  onHideTooltip: () => void;
  onSelectComponent: (componentName: string) => void; // For folder clicks
}

const TreeViewNode: React.FC<{
    node: TreeItem;
    level: number;
    expandedNodes: Set<string>;
    onToggleExpand: (nodeId: string) => void;
    onAddToWatchList: (itemData: HalItemData) => void;
    onShowTooltip: (itemData: HalItemData, event: React.MouseEvent) => void;
    onHideTooltip: () => void;
    onSelectComponent: (componentName: string) => void;
}> = ({ node, level, expandedNodes, onToggleExpand, ...restProps }) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;

    const handleNodeClick = () => {
        if (node.itemType === 'folder' && !hasChildren && node.id.includes(':')) { // Heuristic for component folder
            // Example id: 'root:pins:mycomp' or 'pin:mycomp'
            const parts = node.id.split(':');
            if (parts.length > (node.id.startsWith('root:') ? 2 : 1) ) { // ensure there's a component name part
                 const compName = parts.slice(node.id.startsWith('root:') ? 2 : 1).join('.');
                 if(compName) restProps.onSelectComponent(compName);
            }
        }
    };

    const handleDoubleClick = () => {
        if (node.data && (node.itemType === 'pin' || node.itemType === 'param' || node.itemType === 'signal')) {
            restProps.onAddToWatchList(node.data);
        }
    };
    
    const handleMouseEnter = (e: React.MouseEvent) => node.data && restProps.onShowTooltip(node.data, e);

    return (
        <>
            <li
                className={styles.treeItem}
                style={{ paddingLeft: `${level * 18}px` }}
                onClick={handleNodeClick}
                onDoubleClick={handleDoubleClick}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={restProps.onHideTooltip}
                title={node.fullName || node.name}
            >
                {hasChildren ? (
                    <span
                        className={`${styles.toggler} ${isExpanded ? styles.expanded : styles.collapsed}`}
                        onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
                    >
                        {isExpanded ? '▼' : '►'}
                    </span>
                ) : (
                    <span className={styles.leafMarker}>•</span>
                )}
                <span className={styles.itemName}>{node.name}</span>
            </li>
            {hasChildren && isExpanded && (
                node.children.map(child => (
                    <TreeViewNode
                        key={child.id}
                        node={child}
                        level={level + 1}
                        expandedNodes={expandedNodes}
                        onToggleExpand={onToggleExpand}
                        {...restProps}
                    />
                ))
            )}
        </>
    );
};


const TreeView: React.FC<TreeViewProps> = ({
  halData,
  filterText,
  onAddToWatchList,
  onShowTooltip,
  onHideTooltip,
  onSelectComponent,
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const treeStructure = useMemo(() => {
    return buildTreeStructure(halData, filterText);
  }, [halData, filterText]);

  // Auto-expand nodes if filtering or top-level root nodes
  useEffect(() => {
    const newExpanded = new Set<string>();
    function traverseAndExpand(nodes: TreeItem[], currentLevel: number) {
        nodes.forEach(node => {
            if (filterText.trim() || node.itemType === 'root' || currentLevel < 1) {
                 newExpanded.add(node.id);
            }
            if (node.children) {
                traverseAndExpand(node.children, currentLevel + 1);
            }
        });
    }
    if (treeStructure) {
        traverseAndExpand(treeStructure, 0);
    }
    setExpandedNodes(newExpanded);
  }, [treeStructure, filterText]);


  const handleToggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  if (!halData) {
    return <div className={styles.treeViewContainer}>Loading tree data...</div>;
  }
  if (treeStructure.length === 0 && filterText) {
    return <div className={styles.treeViewContainer}>No items match filter "{filterText}".</div>;
  }
  if (treeStructure.length === 0) {
    return <div className={styles.treeViewContainer}>No HAL data available.</div>;
  }

  return (
    <ul className={styles.treeViewContainer}>
      {treeStructure.map(node => (
        <TreeViewNode
          key={node.id}
          node={node}
          level={0}
          expandedNodes={expandedNodes}
          onToggleExpand={handleToggleExpand}
          onAddToWatchList={onAddToWatchList}
          onShowTooltip={onShowTooltip}
          onHideTooltip={onHideTooltip}
          onSelectComponent={onSelectComponent}
        />
      ))}
    </ul>
  );
};

export default TreeView;