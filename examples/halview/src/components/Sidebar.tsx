import React, { useState, useMemo, useEffect } from 'react';
import { Menu, Tree, Button, Input, Spin, Empty, theme as antdTheme } from 'antd';
import { ReloadOutlined, ApartmentOutlined, NodeIndexOutlined, BranchesOutlined, BuildOutlined, FolderOpenOutlined, FolderOutlined } from '@ant-design/icons';
import { FullHalData, HalItemData, TreeItem as AppTreeItem } from '../../electron/types';
import { buildTreeStructure, formatItemDetails } from '../utils/formatters'; 
const { DirectoryTree } = Tree;
const { useToken } = antdTheme;


interface SidebarProps {
  halData: FullHalData | null;
  view: 'tree' | 'component';
  selectedComponent: string | null;
  onSetView: (view: 'tree' | 'component') => void;
  onSelectComponent: (componentName: string | null) => void;
  onAddToWatchList: (itemData: HalItemData) => void;
  onShowTooltip: (contentProvider: () => string, event: React.MouseEvent) => void;
  onHideTooltip: () => void;
  onRefresh: () => void;
  theme: 'light' | 'dark';
}

const convertToAntdTreeData = (nodes: AppTreeItem[], filterText: string): any[] => {
  const filter = filterText.toLowerCase();
  return nodes
    .map(node => {
      const title = node.name;
      const key = node.id;
      const isLeafDataNode = node.data && (node.itemType === 'pin' || node.itemType === 'param' || node.itemType === 'signal');
      const isComponentFolder = node.itemType === 'folder' && node.id.split(':').length > (node.id.startsWith('root:') ? 2 : 1) && !node.id.endsWith('_root');


      let icon;
      switch(node.itemType){
        case 'root': icon = <FolderOpenOutlined />; break;
        case 'folder': icon = isComponentFolder ? <BuildOutlined/> : <FolderOutlined />; break;
        case 'pin': icon = <NodeIndexOutlined />; break;
        case 'param': icon = <ApartmentOutlined />; break;
        case 'signal': icon = <BranchesOutlined />; break;
        default: icon = <FolderOutlined />;
      }
      
      const children = node.children && node.children.length > 0
        ? convertToAntdTreeData(node.children, filterText)
        : undefined;

      // Filtering logic - if node itself matches or has matching children
      const nodeMatches = title.toLowerCase().includes(filter);
      const childrenMatch = children && children.length > 0;

      if (!filterText || nodeMatches || childrenMatch) {
        return {
          title,
          key,
          icon,
          children,
          isLeaf: !children && isLeafDataNode, 
          data: node.data, // Pass original data
          itemType: node.itemType,
          isComponentFolder,
        };
      }
      return null;
    })
    .filter(node => node !== null);
};


const SidebarComponent: React.FC<SidebarProps> = ({
  halData,
  view, // 'tree' or 'component' - 'view' prop is not directly used by AntD Sider display logic but by App.tsx
  selectedComponent,
  onSetView,
  onSelectComponent,
  onAddToWatchList,
  onShowTooltip,
  onHideTooltip,
  onRefresh,
  theme
}) => {
  const [filterText, setFilterText] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState(true);
  const { token } = useToken();

  const antdTreeData = useMemo(() => {
    if (!halData) return [];
    return convertToAntdTreeData(buildTreeStructure(halData, ''), filterText); // Initial build without filter for keys
  }, [halData]);

  // Auto expand based on filter
   useEffect(() => {
    if (filterText && halData) {
        const newExpandedKeys: React.Key[] = [];
        const nodesToSearch = buildTreeStructure(halData, filterText); // Filtered structure

        function getKeysToExpand(nodes: AppTreeItem[]) {
            nodes.forEach(node => {
                if (node.children && node.children.length > 0) {
                    newExpandedKeys.push(node.id);
                    getKeysToExpand(node.children);
                }
            });
        }
        getKeysToExpand(nodesToSearch);
        setExpandedKeys(newExpandedKeys);
        setAutoExpandParent(true);
    } else if (halData) { // Expand root nodes by default if no filter
        const rootKeys = buildTreeStructure(halData, '').map(n => n.id);
        setExpandedKeys(rootKeys);
    } else {
        setExpandedKeys([]);
    }
  }, [filterText, halData]);


  const onExpand = (newExpandedKeys: React.Key[]) => {
    setExpandedKeys(newExpandedKeys);
    setAutoExpandParent(false);
  };

  const handleTreeSelect = (selectedKeys: React.Key[], info: any) => {
    if (info.node.isLeaf && info.node.data) {
    } else if (info.node.isComponentFolder || (info.node.itemType === 'folder' && !info.node.children?.length)) {
      // If it's marked as a component folder OR it's a folder that appears to be a leaf (like comp.0)
      const componentName = info.node.key.split(':').slice(info.node.key.startsWith('root:') ? 2 : 1).join('.');
      if(componentName) {
        onSelectComponent(componentName);
        onSetView('component');
      }
    }
  };

  const handleDoubleClick = (event: React.MouseEvent, node: any) => {
    if (node.isLeaf && node.data) {
      onAddToWatchList(node.data);
    }
  };
  
  const handleMouseEnter = (event: React.MouseEvent, node: any) => {
    if (node.data) {
      onShowTooltip(() => formatItemDetails(node.data as HalItemData), event);
    }
  };

  const filteredAntdTreeData = useMemo(() => {
    if (!halData) return [];
    if (!filterText) return antdTreeData; // Use pre-calculated if no filter
    return convertToAntdTreeData(buildTreeStructure(halData, filterText), ''); // Re-filter for display
  }, [halData, filterText, antdTreeData]);


  if (view === 'component' && selectedComponent && halData) {
    const pins = halData.pins.filter(p => p.name.startsWith(selectedComponent + '.'));
    const params = halData.params.filter(p => p.name.startsWith(selectedComponent + '.'));
    return (
        <div style={{ padding: '10px', color: token.colorText }}>
            <Button onClick={() => { onSelectComponent(null); onSetView('tree');}} style={{ marginBottom: 10 }} block>
                ← Back to Tree
            </Button>
            <h3 style={{color: token.colorTextHeading}}>Comp: {selectedComponent}</h3>
            <h4 style={{color: token.colorTextSecondary}}>Pins ({pins.length})</h4>
            {pins.length > 0 ? (
                <Menu theme={theme} mode="inline" selectable={false} style={{borderRight: 0}}>
                {pins.map(pin => (
                    <Menu.Item 
                        key={pin.name} 
                        icon={<NodeIndexOutlined />}
                        onDoubleClick={() => onAddToWatchList(pin)}
                        onMouseEnter={(e) => onShowTooltip(() => formatItemDetails(pin), e.domEvent as any)}
                        onMouseLeave={onHideTooltip}
                    >
                    {pin.name.substring(selectedComponent.length + 1)}
                    </Menu.Item>
                ))}
                </Menu>
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No pins" />}
            
            <h4 style={{marginTop: 15, color: token.colorTextSecondary}}>Params ({params.length})</h4>
            {params.length > 0 ? (
                <Menu theme={theme} mode="inline" selectable={false} style={{borderRight: 0}}>
                {params.map(param => (
                    <Menu.Item 
                        key={param.name} 
                        icon={<ApartmentOutlined />}
                        onDoubleClick={() => onAddToWatchList(param)}
                        onMouseEnter={(e) => onShowTooltip(() => formatItemDetails(param), e.domEvent as any)}
                        onMouseLeave={onHideTooltip}
                    >
                    {param.name.substring(selectedComponent.length + 1)}
                    </Menu.Item>
                ))}
                </Menu>
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No params" />}
        </div>
    )
  }


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 64px)' }}>
      <div style={{ padding: '10px 10px 0 10px', marginBottom: '10px' }}>
        <Button icon={<ReloadOutlined />} onClick={onRefresh} block style={{ marginBottom: 10 }}>
          Refresh HAL Data
        </Button>
        <Input.Search
          placeholder="Filter tree..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          allowClear
        />
      </div>
      {!halData ? (
        <div style={{ textAlign: 'center', marginTop: 20 }}><Spin tip="Loading HAL Data..." /></div>
      ) : filteredAntdTreeData.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={filterText ? "No items match filter" : "No HAL data"} />
      ) : (
        <DirectoryTree
          className="draggable-tree" 
          multiple={false} // Single selection for component view trigger
          defaultExpandAll={false} // Controlled by expandedKeys
          expandedKeys={expandedKeys}
          autoExpandParent={autoExpandParent}
          onExpand={onExpand}
          treeData={filteredAntdTreeData}
          onSelect={handleTreeSelect}
          onDoubleClick={handleDoubleClick}
          showIcon
          titleRender={(node: any) => ( // Use any because AntD node type is too complex to care
            <span 
                onMouseEnter={(e) => handleMouseEnter(e, node)}
                onMouseLeave={onHideTooltip}
            >
                {node.title}
            </span>
          )}
          style={{flexGrow: 1, overflowY: 'auto', padding: '0 10px 10px 10px'}}
        />
      )}
    </div>
  );
};

export default SidebarComponent;