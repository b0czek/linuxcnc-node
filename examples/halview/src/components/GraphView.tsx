import React, { useState, useCallback, useMemo } from 'react';
import { 
  ReactFlow, 
  Node, 
  Edge, 
  addEdge, 
  Connection, 
  useNodesState, 
  useEdgesState,
  Controls,
  Background,
  Panel,
  ReactFlowProvider,
  ConnectionLineType,
  MarkerType,
  EdgeProps,
  getStraightPath,
  getSimpleBezierPath,
  BaseEdge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { 
  Button, 
  Select, 
  Space, 
  Modal, 
  List, 
  Typography, 
  Popconfirm,
  Tooltip,
  Card,
  Dropdown,
  message
} from 'antd';
import { 
  PlusOutlined, 
  DeleteOutlined, 
  DisconnectOutlined, 
  LinkOutlined,
  InfoCircleOutlined,
  LayoutOutlined
} from '@ant-design/icons';
import { FullHalData, HalPinData, HalSignalData } from '../../electron/types';
import HalComponentNode from './HalComponentNode';

const { Title, Text } = Typography;
const { Option } = Select;

// Custom node types
const nodeTypes = {
  halComponent: HalComponentNode,
};

interface GraphViewProps {
  halData: FullHalData | null;
  onExecuteCommand: (command: string, args: any[]) => Promise<void>;
}

interface ComponentNodeData extends Record<string, unknown> {
  componentName: string;
  pins: HalPinData[];
  onRemove?: (componentId: string) => void;
  onPinConnect?: (pinName: string, signalName: string) => void;
  onPinDisconnect?: (pinName: string) => void;
  availableSignals?: HalSignalData[];
}

const GraphView: React.FC<GraphViewProps> = ({ halData, onExecuteCommand }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ComponentNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [showAddComponentModal, setShowAddComponentModal] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<string>('');

  // Get list of available components
  const availableComponents = useMemo(() => {
    if (!halData) return [];
    
    const componentSet = new Set<string>();
    halData.pins.forEach(pin => {
      const parts = pin.name.split('.');
      if (parts.length > 1) {
        // Component name is everything except the last part
        const componentName = parts.slice(0, -1).join('.');
        componentSet.add(componentName);
      }
    });
    
    return Array.from(componentSet).sort();
  }, [halData]);

  // Get pins for a specific component
  const getComponentPins = useCallback((componentName: string): HalPinData[] => {
    if (!halData) return [];
    
    return halData.pins.filter(pin => {
      const parts = pin.name.split('.');
      if (parts.length > 1) {
        const pinComponentName = parts.slice(0, -1).join('.');
        return pinComponentName === componentName;
      }
      return false;
    });
  }, [halData]);

  // Generate edges based on signal connections
  const generateEdgesFromSignals = useCallback(() => {
    if (!halData || !nodes.length) return [];
    
    const newEdges: Edge[] = [];
    
    // Group pins by signal
    const pinsBySignal = new Map<string, HalPinData[]>();
    halData.pins.forEach(pin => {
      if (pin.signalName) {
        if (!pinsBySignal.has(pin.signalName)) {
          pinsBySignal.set(pin.signalName, []);
        }
        pinsBySignal.get(pin.signalName)!.push(pin);
      }
    });
    
    // Create edges for each signal
    pinsBySignal.forEach((pins, signalName) => {
      if (pins.length < 2) return; // Need at least 2 pins to create connections
      
      // Find output pins (sources) and input/io pins (targets)
      const outputPins = pins.filter(pin => pin.direction === 32); // HAL_OUT
      const inputPins = pins.filter(pin => pin.direction === 16 || pin.direction === 48); // HAL_IN or HAL_IO
      
      // Create edges from each output pin to each input pin
      outputPins.forEach(outputPin => {
        inputPins.forEach(inputPin => {
          const outputParts = outputPin.name.split('.');
          const inputParts = inputPin.name.split('.');
          
          if (outputParts.length > 1 && inputParts.length > 1) {
            const outputComponent = outputParts.slice(0, -1).join('.');
            const inputComponent = inputParts.slice(0, -1).join('.');
            
            // Check if both components are in the current graph
            const outputNodeExists = nodes.some(node => node.data.componentName === outputComponent);
            const inputNodeExists = nodes.some(node => node.data.componentName === inputComponent);
            
            if (outputNodeExists && inputNodeExists) {
              const edgeId = `${outputPin.name}-${inputPin.name}`;
              
              // Get color based on signal type/value
              const getEdgeColor = (pin: HalPinData) => {
                switch (pin.type) {
                  case 1: return '#52c41a'; // HAL_BIT - green
                  case 2: return '#1890ff'; // HAL_FLOAT - blue
                  case 3: return '#fa8c16'; // HAL_S32 - orange
                  case 4: return '#eb2f96'; // HAL_U32 - pink
                  default: return '#666';
                }
              };

              const edgeColor = getEdgeColor(outputPin);
              
              newEdges.push({
                id: edgeId,
                source: outputComponent,
                target: inputComponent,
                sourceHandle: outputPin.name,
                targetHandle: inputPin.name,
                label: signalName,
                type: 'smoothstep',
                style: { 
                  stroke: edgeColor,
                  strokeWidth: 3,
                  strokeDasharray: undefined,
                },
                labelStyle: {
                  fontSize: '10px',
                  fill: '#333',
                  background: 'rgba(255, 255, 255, 0.9)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: `1px solid ${edgeColor}`,
                  fontWeight: 500,
                },
                labelBgStyle: {
                  fill: 'rgba(255, 255, 255, 0.9)',
                  fillOpacity: 0.9,
                },
                animated: false,
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: edgeColor,
                  width: 20,
                  height: 20,
                },
              });
            }
          }
        });
      });
    });
    
    return newEdges;
  }, [halData, nodes]);

  // Update edges when nodes or halData changes
  React.useEffect(() => {
    const newEdges = generateEdgesFromSignals();
    setEdges(newEdges);
  }, [generateEdgesFromSignals, setEdges]);

  // Update node data when halData changes
  React.useEffect(() => {
    setNodes(prevNodes => 
      prevNodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          pins: getComponentPins(node.data.componentName),
          availableSignals: halData?.signals || [],
        }
      }))
    );
  }, [halData, getComponentPins, setNodes]);

  // Add component to graph
  const handleAddComponent = useCallback(() => {
    if (!selectedComponent || !halData) return;
    
    const pins = getComponentPins(selectedComponent);
    if (pins.length === 0) {
      message.warning(`No pins found for component ${selectedComponent}`);
      return;
    }

    // Check if component already exists
    const existingNode = nodes.find(node => 
      node.data.componentName === selectedComponent
    );
    
    if (existingNode) {
      message.warning(`Component ${selectedComponent} is already in the graph`);
      return;
    }

    const newNode: Node<ComponentNodeData> = {
      id: selectedComponent,
      type: 'halComponent',
      position: { 
        x: Math.random() * 600 + 150, 
        y: Math.random() * 400 + 150 
      },
      data: {
        componentName: selectedComponent,
        pins: pins,
        onRemove: handleRemoveComponent,
        onPinConnect: handlePinConnect,
        onPinDisconnect: handlePinDisconnect,
        availableSignals: halData?.signals || [],
      },
    };

    setNodes(prev => [...prev, newNode]);
    setShowAddComponentModal(false);
    setSelectedComponent('');
    message.success(`Component ${selectedComponent} added to graph`);
  }, [selectedComponent, halData, nodes, setNodes, getComponentPins]);

  // Remove component from graph
  const handleRemoveComponent = useCallback((componentId: string) => {
    setNodes(prev => prev.filter(node => node.id !== componentId));
    setEdges(prev => prev.filter((edge: Edge) => 
      edge.source !== componentId && edge.target !== componentId
    ));
    message.success(`Component removed from graph`);
  }, [setNodes, setEdges]);

  // Handle pin connection
  const handlePinConnect = useCallback((pinName: string, signalName: string) => {
    onExecuteCommand('net', [signalName, pinName]);
  }, [onExecuteCommand]);

  // Handle pin disconnection
  const handlePinDisconnect = useCallback((pinName: string) => {
    onExecuteCommand('unlinkp', [pinName]);
  }, [onExecuteCommand]);

  // Get available signals for connection
  const getAvailableSignals = useCallback((pinType: number): HalSignalData[] => {
    if (!halData) return [];
    
    return halData.signals.filter(signal => signal.type === pinType);
  }, [halData]);

  // Handle manual pin connection via drag and drop
  const handleManualConnect = useCallback((params: Connection) => {
    if (!halData || !params.source || !params.target || !params.sourceHandle || !params.targetHandle) {
      return;
    }

    // Find the source and target pins
    const sourcePin = halData.pins.find(pin => pin.name === params.sourceHandle);
    const targetPin = halData.pins.find(pin => pin.name === params.targetHandle);

    if (!sourcePin || !targetPin) {
      message.error('Could not find pins for connection');
      return;
    }

    // Check if pins are compatible
    if (sourcePin.type !== targetPin.type) {
      message.error(`Cannot connect pins of different types: ${sourcePin.typeName} to ${targetPin.typeName}`);
      return;
    }

    // Check if source is output and target is input/io
    if (sourcePin.direction !== 32) { // HAL_OUT
      message.error('Source pin must be an output pin');
      return;
    }

    if (targetPin.direction !== 16 && targetPin.direction !== 48) { // HAL_IN or HAL_IO
      message.error('Target pin must be an input or I/O pin');
      return;
    }

    // Create a new signal name if pins aren't already connected to the same signal
    if (sourcePin.signalName && targetPin.signalName && sourcePin.signalName === targetPin.signalName) {
      message.info('Pins are already connected to the same signal');
      return;
    }

    // Use existing signal or create a new one
    let signalName = sourcePin.signalName || targetPin.signalName;
    if (!signalName) {
      // Generate a new signal name
      const sourcePinName = sourcePin.name.split('.').pop();
      const targetPinName = targetPin.name.split('.').pop();
      signalName = `${sourcePinName}-to-${targetPinName}`;
    }

    // Connect both pins to the signal
    if (sourcePin.signalName !== signalName) {
      onExecuteCommand('net', [signalName, sourcePin.name]);
    }
    if (targetPin.signalName !== signalName) {
      onExecuteCommand('net', [signalName, targetPin.name]);
    }

    message.success(`Connected pins via signal: ${signalName}`);
  }, [halData, onExecuteCommand]);

  // Auto-layout function to arrange nodes in a grid-like pattern
  const arrangeNodes = useCallback(() => {
    if (nodes.length === 0) return;

    const nodeWidth = 300;
    const nodeHeight = 200;
    const horizontalSpacing = 400;
    const verticalSpacing = 300;
    const startX = 150;
    const startY = 150;

    // Calculate grid dimensions
    const cols = Math.ceil(Math.sqrt(nodes.length * 1.5)); // Make it wider than tall
    const rows = Math.ceil(nodes.length / cols);

    const updatedNodes = nodes.map((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      
      return {
        ...node,
        position: {
          x: startX + col * horizontalSpacing,
          y: startY + row * verticalSpacing,
        }
      };
    });

    setNodes(updatedNodes);
  }, [nodes, setNodes]);

  return (
    <div style={{ 
      width: '100%', 
      height: '100%',
      minHeight: '500px',
      minWidth: '400px',
      border: '1px solid #d9d9d9', 
      borderRadius: '6px',
      position: 'relative'
    }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleManualConnect}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-left"
          snapToGrid={true}
          snapGrid={[15, 15]}
          connectionLineType={ConnectionLineType.SmoothStep}
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: false,
            style: { strokeWidth: 3 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
            }
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Panel position="top-left">
            <Card size="small" style={{ width: 350 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Title level={5} style={{ margin: 0 }}>HAL Component Graph</Title>
                <Space style={{ width: '100%' }}>
                  <Button 
                    type="primary" 
                    icon={<PlusOutlined />}
                    onClick={() => setShowAddComponentModal(true)}
                    size="small"
                  >
                    Add Component
                  </Button>
                  <Button 
                    icon={<LayoutOutlined />}
                    onClick={arrangeNodes}
                    size="small"
                    disabled={nodes.length === 0}
                  >
                    Auto Layout
                  </Button>
                </Space>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {nodes.length} components in graph
                </Text>
              </Space>
            </Card>
          </Panel>
          
          <Controls />
          <Background />
        </ReactFlow>

        {/* Add Component Modal */}
        <Modal
          title="Add Component to Graph"
          open={showAddComponentModal}
          onOk={handleAddComponent}
          onCancel={() => {
            setShowAddComponentModal(false);
            setSelectedComponent('');
          }}
          okButtonProps={{ disabled: !selectedComponent }}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>Select a HAL component to add to the graph:</Text>
            <Select
              style={{ width: '100%' }}
              placeholder="Choose a component"
              value={selectedComponent}
              onChange={setSelectedComponent}
              showSearch
              filterOption={(input, option) =>
                String(option?.label || option?.children || '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {availableComponents.map(comp => (
                <Option key={comp} value={comp}>
                  {comp} ({getComponentPins(comp).length} pins)
                </Option>
              ))}
            </Select>
            {selectedComponent && (
              <div>
                <Text strong>Pins for {selectedComponent}:</Text>
                <List
                  size="small"
                  dataSource={getComponentPins(selectedComponent).slice(0, 5)}
                  renderItem={pin => (
                    <List.Item>
                      <Text code style={{ fontSize: '11px' }}>
                        {pin.name} ({pin.typeName}, {pin.directionName})
                      </Text>
                    </List.Item>
                  )}
                  style={{ maxHeight: '150px', overflow: 'auto' }}
                />
                {getComponentPins(selectedComponent).length > 5 && (
                  <Text type="secondary" style={{ fontSize: '11px' }}>
                    ... and {getComponentPins(selectedComponent).length - 5} more pins
                  </Text>
                )}
              </div>
            )}
          </Space>
        </Modal>
      </ReactFlowProvider>
    </div>
  );
};

export default GraphView;
