import React, { useState, useCallback } from 'react';
import { Modal, Select, Space, Typography, Button, message } from 'antd';
import { HalSignalData, HalPinData } from '../../electron/types';

const { Text } = Typography;
const { Option } = Select;

interface PinConnectionModalProps {
  visible: boolean;
  pin: HalPinData | null;
  availableSignals: HalSignalData[];
  onConnect: (pinName: string, signalName: string) => void;
  onDisconnect: (pinName: string) => void;
  onClose: () => void;
}

const PinConnectionModal: React.FC<PinConnectionModalProps> = ({
  visible,
  pin,
  availableSignals,
  onConnect,
  onDisconnect,
  onClose,
}) => {
  const [selectedSignal, setSelectedSignal] = useState<string>('');
  const [newSignalName, setNewSignalName] = useState<string>('');
  const [showNewSignal, setShowNewSignal] = useState(false);

  const formatValue = (value: any) => {
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'number') {
      if (Number.isInteger(value)) return value.toString();
      return value.toFixed(3);
    }
    return String(value);
  };

  const handleConnect = useCallback(() => {
    if (!pin) return;
    
    if (showNewSignal && newSignalName) {
      // Create new signal and connect - this would need to call newsig first
      onConnect(pin.name, newSignalName);
      setNewSignalName('');
    } else if (selectedSignal) {
      onConnect(pin.name, selectedSignal);
    }
    
    setSelectedSignal('');
    setShowNewSignal(false);
    onClose();
  }, [pin, selectedSignal, newSignalName, showNewSignal, onConnect, onClose]);

  const handleDisconnect = useCallback(() => {
    if (!pin) return;
    onDisconnect(pin.name);
    onClose();
  }, [pin, onDisconnect, onClose]);

  const handleCancel = useCallback(() => {
    setSelectedSignal('');
    setNewSignalName('');
    setShowNewSignal(false);
    onClose();
  }, [onClose]);

  if (!pin) return null;

  const compatibleSignals = availableSignals.filter(signal => signal.type === pin.type);

  return (
    <Modal
      title={`Pin Connection: ${pin.name}`}
      open={visible}
      onCancel={handleCancel}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Cancel
        </Button>,
        ...(pin.signalName ? [
          <Button key="disconnect" danger onClick={handleDisconnect}>
            Disconnect from {pin.signalName}
          </Button>
        ] : []),
        <Button 
          key="connect" 
          type="primary" 
          onClick={handleConnect}
          disabled={!selectedSignal && !(showNewSignal && newSignalName)}
        >
          Connect
        </Button>,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <div>
          <Text strong>Pin Information:</Text>
          <div style={{ marginLeft: 16, fontSize: '12px' }}>
            <div>Type: {pin.typeName}</div>
            <div>Direction: {pin.directionName}</div>
            <div>Current Value: {formatValue(pin.value)}</div>
            {pin.signalName && <div>Connected to: {pin.signalName}</div>}
          </div>
        </div>

        <div>
          <Text strong>Connect to Signal:</Text>
          <div style={{ marginTop: 8 }}>
            <Select
              style={{ width: '100%' }}
              placeholder="Choose an existing signal"
              value={selectedSignal}
              onChange={setSelectedSignal}
              showSearch
              disabled={showNewSignal}
              filterOption={(input, option) =>
                String(option?.children || '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {compatibleSignals.map(signal => (
                <Option key={signal.name} value={signal.name}>
                  {signal.name} ({signal.typeName}) - {formatValue(signal.value)}
                </Option>
              ))}
            </Select>
            {compatibleSignals.length === 0 && !showNewSignal && (
              <Text type="secondary" style={{ fontSize: '12px' }}>
                No compatible signals found for {pin.typeName} type.
              </Text>
            )}
          </div>
        </div>

        <div>
          <Button 
            type={showNewSignal ? "primary" : "default"}
            onClick={() => {
              setShowNewSignal(!showNewSignal);
              if (!showNewSignal) {
                setSelectedSignal('');
              }
            }}
            style={{ marginBottom: 8 }}
          >
            {showNewSignal ? 'Use Existing Signal' : 'Create New Signal'}
          </Button>
          
          {showNewSignal && (
            <Select
              style={{ width: '100%' }}
              placeholder="Enter new signal name"
              value={newSignalName}
              onChange={setNewSignalName}
              mode="tags"
              maxTagCount={1}
            />
          )}
        </div>
      </Space>
    </Modal>
  );
};

export default PinConnectionModal;
