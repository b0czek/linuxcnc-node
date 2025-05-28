import React, { useState, useEffect } from 'react';
import { Table, Button, Select, Input, Popconfirm, Space, Tag, Typography, InputNumber, Switch, Tooltip as AntdTooltip } from 'antd'; 
import { DeleteOutlined, UploadOutlined, SaveOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons'; 
import { WatchListItem } from '../../electron/types';
import { formatDisplayValue, formatItemDetails } from '../utils/formatters';

const { Option } = Select;
const { Text } = Typography;

interface WatchViewProps {
  watchList: WatchListItem[];
  presets: { [name: string]: string[] };
  onRemoveItem: (itemName: string) => void;
  onClearWatchList: () => void;
  onSavePreset: (name: string) => void;
  onApplyPreset: (presetName: string) => void;
  onShowTooltip: (contentProvider: () => string, event: React.MouseEvent) => void;
  onHideTooltip: () => void;
  onExecuteCommand: (command: string, args: any[]) => Promise<void>;
}

const EditableCell: React.FC<{
  item: WatchListItem;
  onSave: (itemName: string, itemType: 'pin' | 'param' | 'signal', value: any) => Promise<void>;
}> = ({ item, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState<any>(item.value);

  useEffect(() => {
    if (!editing) {
      if (item.dataTypeName === 'HAL_BIT') {
        setInputValue(item.value === true || String(item.value).toUpperCase() === 'TRUE');
      } else {
        setInputValue(item.value);
      }
    }
  }, [item.value, item.dataTypeName, editing]);


  const toggleEdit = () => {
    setEditing(!editing);
    if (editing) {
        if (item.dataTypeName === 'HAL_BIT') {
            setInputValue(item.value === true || String(item.value).toUpperCase() === 'TRUE');
        } else {
            setInputValue(item.value);
        }
    }
  };

  const handleSave = async () => {
    const command = item.type === 'signal' ? 'sets' : 'setp';
    await onSave(item.name, item.type, inputValue);
    setEditing(false);
  };

  const commonInputProps = {
    size: 'small' as 'small',
    onPressEnter: handleSave,
    onBlur: () => { 
        setEditing(false); 
        setInputValue(item.value); // Reset to original if not saved
    },
  };

  if (!item.isWritable) {
    return <span>{formatDisplayValue(item.value, item.dataTypeName)}</span>;
  }

  if (editing) {
    return (
      <Space.Compact style={{ width: '100%' }}>
        {item.dataTypeName === 'HAL_BIT' ? (
          <Switch
            checked={inputValue as boolean}
            onChange={setInputValue}
            size="small"
            checkedChildren="1"
            unCheckedChildren="0"
            autoFocus
          />
        ) : item.dataTypeName === 'HAL_FLOAT' ? (
          <InputNumber
            {...commonInputProps}
            value={Number(inputValue)}
            onChange={(v) => setInputValue(v)}
            step={0.001}
            style={{ width: 'calc(100% - 60px)'}} 
            autoFocus
          />
        ) : (item.dataTypeName === 'HAL_S32' || item.dataTypeName === 'HAL_U32') ? (
          <InputNumber
            {...commonInputProps}
            value={Number(inputValue)}
            onChange={(v) => setInputValue(v)}
            style={{ width: 'calc(100% - 60px)'}}
            autoFocus
          />
        ) : (
          <Input
            {...commonInputProps}
            value={String(inputValue)}
            onChange={(e) => setInputValue(e.target.value)}
            style={{ width: 'calc(100% - 60px)'}}
            autoFocus
          />
        )}
        <Button icon={<CheckOutlined />} size="small" type="primary" onClick={handleSave} />
        <Button icon={<CloseOutlined />} size="small" onClick={toggleEdit} />
      </Space.Compact>
    );
  }

  return (
    <AntdTooltip title="Click to edit" mouseEnterDelay={0.5}>
      <span onClick={toggleEdit} style={{ cursor: 'pointer', display: 'inline-block', minWidth: '50px' }}>
        {formatDisplayValue(item.value, item.dataTypeName)}
      </span>
    </AntdTooltip>
  );
};


const WatchView: React.FC<WatchViewProps> = ({
  watchList,
  presets,
  onRemoveItem,
  onClearWatchList,
  onSavePreset,
  onApplyPreset,
  onShowTooltip,
  onHideTooltip,
  onExecuteCommand,
}) => {
  const [newPresetName, setNewPresetName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string>(Object.keys(presets)[0] || '');

  const handleCellSave = async (itemName: string, itemType: 'pin' | 'param' | 'signal', value: any) => {
    const command = itemType === 'signal' ? 'sets' : 'setp';
    await onExecuteCommand(command, [itemName, value]);
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      width: '40%',
      render: (name: string, record: WatchListItem) => (
        <Text
            ellipsis={{ tooltip: { title: formatItemDetails(record.details || record as any), placement: 'topLeft' } }}
            onMouseEnter={(e: any) => onShowTooltip(() => formatItemDetails(record.details || record as any), e)}
            onMouseLeave={onHideTooltip}
            style={{cursor: 'default'}}
        >
            {name}
        </Text>
      ),
    },
    {
      title: 'Value',
      dataIndex: 'value',
      key: 'value',
      width: '25%',
      align: 'right' as 'right',
      render: (_: any, record: WatchListItem) => (
        <EditableCell item={record} onSave={handleCellSave} />
      ),
    },
    {
      title: 'Type',
      dataIndex: 'dataTypeName',
      key: 'dataTypeName',
      width: 100,
      render: (typeName: string) => <Tag>{typeName.replace('HAL_', '')}</Tag>
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      align: 'center' as 'center',
      render: (_: any, record: WatchListItem) => (
        <Popconfirm title="Remove this item?" onConfirm={() => onRemoveItem(record.name)} okText="Yes" cancelText="No">
          <Button icon={<DeleteOutlined />} size="small" danger />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          value={selectedPreset || undefined}
          style={{ width: 180 }}
          onChange={(value) => setSelectedPreset(value)}
          placeholder="Select a preset"
          disabled={Object.keys(presets).length === 0}
        >
          {Object.keys(presets).map(name => (
            <Option key={name} value={name}>{name}</Option>
          ))}
        </Select>
        <Button 
            icon={<UploadOutlined />} 
            onClick={() => onApplyPreset(selectedPreset)}
            disabled={!selectedPreset}
        >
          Load Preset
        </Button>
        <Input
          placeholder="New preset name"
          value={newPresetName}
          onChange={(e) => setNewPresetName(e.target.value)}
          style={{ width: 180 }}
        />
        <Button 
            type="primary" 
            icon={<SaveOutlined />} 
            onClick={() => { if(newPresetName.trim()) {onSavePreset(newPresetName.trim()); setNewPresetName('');} }}
            disabled={!newPresetName.trim()}
        >
          Save Current
        </Button>
        <Popconfirm title="Clear entire watch list?" onConfirm={onClearWatchList} okText="Yes" cancelText="No">
          <Button danger icon={<DeleteOutlined />}>
            Clear Watch
          </Button>
        </Popconfirm>
      </Space>
      <Table
        columns={columns}
        dataSource={watchList}
        rowKey="name"
        pagination={{ pageSize: 50, size: "small", hideOnSinglePage: true }}
        scroll={{ y: 'calc(100vh - 320px)' }} 
        size="small"
        bordered
        style={{ flexGrow: 1 }}
        locale={{ emptyText: <Text type="secondary" style={{textAlign: 'center', padding: 20}}>Double-click items in the sidebar to add them to the watch list.</Text> }}
      />
    </div>
  );
};

export default WatchView;