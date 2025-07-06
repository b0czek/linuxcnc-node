import React, { memo, useCallback, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { 
  Card, 
  Typography, 
  Space, 
  Button, 
  Tooltip, 
  Popconfirm,
  Tag,
  Dropdown
} from 'antd';
import { 
  DeleteOutlined,
  LinkOutlined,
  DisconnectOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { HalPinData, HalSignalData } from '../../electron/types';
import PinConnectionModal from './PinConnectionModal';

const { Text } = Typography;

interface ComponentNodeData extends Record<string, unknown> {
  componentName: string;
  pins: HalPinData[];
  onRemove?: (componentId: string) => void;
  onPinConnect?: (pinName: string, signalName: string) => void;
  onPinDisconnect?: (pinName: string) => void;
  availableSignals?: HalSignalData[];
}

interface HalComponentNodeProps extends NodeProps {
  data: ComponentNodeData;
}

const HalComponentNode: React.FC<HalComponentNodeProps> = ({ data, id }) => {
  const { componentName, pins, onRemove, onPinConnect, onPinDisconnect, availableSignals = [] } = data;
  const [selectedPin, setSelectedPin] = useState<HalPinData | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);

  // Helper function to extract pin name from full pin name
  const getPinName = (fullPinName: string) => {
    const parts = fullPinName.split('.');
    return parts[parts.length - 1]; // Return the last part
  };

  // Format value function
  const formatValue = (value: any) => {
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'number') {
      if (Number.isInteger(value)) return value.toString();
      return value.toFixed(3);
    }
    return String(value);
  };

  // Separate pins by direction
  const inputPins = pins.filter(pin => pin.direction === 16); // HAL_IN
  const outputPins = pins.filter(pin => pin.direction === 32); // HAL_OUT
  const ioPins = pins.filter(pin => pin.direction === 48); // HAL_IO

  const handleRemoveComponent = useCallback(() => {
    if (onRemove) {
      onRemove(id);
    }
  }, [onRemove, id]);

  const handlePinConnect = useCallback((pinName: string, signalName: string) => {
    if (onPinConnect) {
      onPinConnect(pinName, signalName);
    }
  }, [onPinConnect]);

  const handlePinDisconnect = useCallback((pinName: string) => {
    if (onPinDisconnect) {
      onPinDisconnect(pinName);
    }
  }, [onPinDisconnect]);

  const getPinColor = (direction: number) => {
    switch (direction) {
      case 16: return '#52c41a'; // HAL_IN - green
      case 32: return '#1890ff'; // HAL_OUT - blue  
      case 48: return '#fa8c16'; // HAL_IO - orange
      default: return '#d9d9d9';
    }
  };

  const getConnectedPinColor = (direction: number) => {
    switch (direction) {
      case 16: return '#237804'; // HAL_IN - darker green
      case 32: return '#0050b3'; // HAL_OUT - darker blue  
      case 48: return '#ad4e00'; // HAL_IO - darker orange
      default: return '#595959';
    }
  };

  const createPinMenuItems = (pin: HalPinData) => [
    {
      key: 'info',
      icon: <InfoCircleOutlined />,
      label: `${pin.typeName} | ${pin.directionName} | ${formatValue(pin.value)}`,
      disabled: true,
    },
    {
      key: 'connect',
      icon: <LinkOutlined />,
      label: pin.signalName ? 'Change connection...' : 'Connect to signal...',
      onClick: () => {
        setSelectedPin(pin);
        setShowPinModal(true);
      },
    },
    ...(pin.signalName ? [
      {
        key: 'disconnect',
        icon: <DisconnectOutlined />,
        label: `Disconnect from ${pin.signalName}`,
        onClick: () => handlePinDisconnect(pin.name),
      }
    ] : []),
  ];

  return (
    <>
      <Card
        size="small"
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong style={{ fontSize: '14px' }}>{componentName}</Text>
            <Popconfirm
              title="Remove this component from graph?"
              onConfirm={handleRemoveComponent}
              okText="Yes"
              cancelText="No"
            >
              <Button 
                type="text" 
                size="small" 
                icon={<DeleteOutlined />} 
                danger
              />
            </Popconfirm>
          </div>
        }
        style={{
          minWidth: '200px',
          maxWidth: '300px',
          position: 'relative',
        }}
        bodyStyle={{ padding: '8px 16px' }}
      >
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
            <Tag color="green">IN: {inputPins.length}</Tag>
            <Tag color="blue">OUT: {outputPins.length}</Tag>
            <Tag color="orange">IO: {ioPins.length}</Tag>
          </div>
          
          {/* Pins layout */}
          <div style={{ 
            position: 'relative', 
            minHeight: `${Math.max(inputPins.length, outputPins.length + ioPins.length) * 25 + 40}px`,
            paddingTop: '10px',
            paddingBottom: '10px'
          }}>
            
            {/* Input pins on the left */}
            {inputPins.map((pin, index) => (
              <div key={pin.name}>
                <Handle
                  type="target"
                  position={Position.Left}
                  id={pin.name}
                  style={{
                    left: '-8px',
                    top: `${index * 25 + 15}px`,
                    width: '16px',
                    height: '16px',
                    backgroundColor: pin.signalName ? '#fff' : getPinColor(pin.direction),
                    border: pin.signalName ? `5px solid ${getConnectedPinColor(pin.direction)}` : 'none',
                  }}
                />
                <Dropdown menu={{ items: createPinMenuItems(pin) }} trigger={['contextMenu']}>
                  <Tooltip 
                    title={
                      <div>
                        <div><strong>{pin.name}</strong></div>
                        <div>Type: {pin.typeName}</div>
                        <div>Value: {formatValue(pin.value)}</div>
                        {pin.signalName && <div>Signal: {pin.signalName}</div>}
                      </div>
                    }
                    placement="left"
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: '20px',
                        top: `${index * 25 + 10}px`,
                        fontSize: '10px',
                        color: '#666',
                        cursor: 'pointer',
                      }}
                    >
                      {getPinName(pin.name)}
                      <div style={{ color: '#999', fontSize: '8px' }}>
                        {formatValue(pin.value)}
                      </div>
                    </div>
                  </Tooltip>
                </Dropdown>
              </div>
            ))}

            {/* Output pins on the right */}
            {outputPins.map((pin, index) => (
              <div key={pin.name}>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={pin.name}
                  style={{
                    right: '-8px',
                    top: `${index * 25 + 15}px`,
                    width: '16px',
                    height: '16px',
                    backgroundColor: pin.signalName ? '#fff' : getPinColor(pin.direction),
                    border: pin.signalName ? `5px solid ${getConnectedPinColor(pin.direction)}` : 'none',
                  }}
                />
                <Dropdown menu={{ items: createPinMenuItems(pin) }} trigger={['contextMenu']}>
                  <Tooltip 
                    title={
                      <div>
                        <div><strong>{pin.name}</strong></div>
                        <div>Type: {pin.typeName}</div>
                        <div>Value: {formatValue(pin.value)}</div>
                        {pin.signalName && <div>Signal: {pin.signalName}</div>}
                      </div>
                    }
                    placement="right"
                  >
                    <div
                      style={{
                        position: 'absolute',
                        right: '20px',
                        top: `${index * 25 + 10}px`,
                        fontSize: '10px',
                        color: '#666',
                        textAlign: 'right',
                        cursor: 'pointer',
                      }}
                    >
                      {getPinName(pin.name)}
                      <div style={{ color: '#999', fontSize: '8px' }}>
                        {formatValue(pin.value)}
                      </div>
                    </div>
                  </Tooltip>
                </Dropdown>
              </div>
            ))}

            {/* IO pins on the right (below output pins) */}
            {ioPins.map((pin, index) => (
              <div key={pin.name}>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={pin.name}
                  style={{
                    right: '-8px',
                    top: `${(outputPins.length + index) * 25 + 15}px`,
                    width: '16px',
                    height: '16px',
                    backgroundColor: pin.signalName ? '#fff' : getPinColor(pin.direction),
                    border: pin.signalName ? `5px solid ${getConnectedPinColor(pin.direction)}` : 'none',
                  }}
                />
                <Dropdown menu={{ items: createPinMenuItems(pin) }} trigger={['contextMenu']}>
                  <Tooltip 
                    title={
                      <div>
                        <div><strong>{pin.name}</strong></div>
                        <div>Type: {pin.typeName}</div>
                        <div>Value: {formatValue(pin.value)}</div>
                        {pin.signalName && <div>Signal: {pin.signalName}</div>}
                      </div>
                    }
                    placement="right"
                  >
                    <div
                      style={{
                        position: 'absolute',
                        right: '20px',
                        top: `${(outputPins.length + index) * 25 + 10}px`,
                        fontSize: '10px',
                        color: '#666',
                        textAlign: 'right',
                        cursor: 'pointer',
                      }}
                    >
                      {getPinName(pin.name)}
                      <div style={{ color: '#999', fontSize: '8px' }}>
                        {formatValue(pin.value)}
                      </div>
                    </div>
                  </Tooltip>
                </Dropdown>
              </div>
            ))}
          </div>
        </Space>
      </Card>

      <PinConnectionModal
        visible={showPinModal}
        pin={selectedPin}
        availableSignals={availableSignals}
        onConnect={handlePinConnect}
        onDisconnect={handlePinDisconnect}
        onClose={() => {
          setShowPinModal(false);
          setSelectedPin(null);
        }}
      />
    </>
  );
};

export default memo(HalComponentNode);
