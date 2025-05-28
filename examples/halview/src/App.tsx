import React, { useState, useEffect, useCallback } from 'react';
import { Layout, message, ConfigProvider, theme as antdTheme, Button, InputNumber } from 'antd';
import SidebarComponent from './components/Sidebar'; 
import WatchView from './components/WatchView';
import HalCmdInput from './components/HalCmdInput';
import StatusBarComponent from './components/StatusBar';
import TooltipComponent from './components/Tooltip'; 
import { FullHalData, WatchListItem, HalItemData } from '../electron/types';

const { Header, Content, Footer, Sider } = Layout;

const App: React.FC = () => {
  const [fullHalData, setFullHalData] = useState<FullHalData | null>(null);
  const [currentWatchList, setCurrentWatchList] = useState<WatchListItem[]>([]);
  const [presets, setPresets] = useState<{ [name: string]: string[] }>({});
  const [sidebarView, setSidebarView] = useState<'tree' | 'component'>('tree'); 
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null); 

  const [statusMessage, setStatusText] = useState<string>('Initializing...'); 
  const [statusType, setStatusType] = useState<'info' | 'error' | 'success' | 'warning'>('info');

  const [tooltipContent, setTooltipContent] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [allHalItemNames, setAllHalItemNames] = useState<string[]>([]);
  const [settings, setSettings] = useState<{ watchInterval: number }>({ watchInterval: 200 });

  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('light');
  const { token } = antdTheme.useToken();


  const updateStatus = useCallback((text: string, type: 'info' | 'error' | 'success' | 'warning' = 'info') => {
    setStatusText(text);
    setStatusType(type);
    if (type === 'error') message.error(text, 2);
    else if (type === 'success') message.success(text, 2);
    else if (type === 'warning') message.warning(text, 2);
    // info messages can just update the status bar
  }, []);

  const fetchHalData = useCallback(async () => {
    updateStatus('Fetching HAL data...', 'info');
    try {
      const data = await window.electronAPI.getHalData();
      if (data) {
        setFullHalData(data);
        const itemNames = [
            ...data.pins.map(p => p.name),
            ...data.params.map(p => p.name),
            ...data.signals.map(s => s.name),
        ];
        setAllHalItemNames(itemNames);
        updateStatus('HAL data loaded.', 'success');
      } else {
        updateStatus('Failed to load HAL data.', 'error');
      }
    } catch (error) {
      updateStatus(`Error fetching HAL data: ${(error as Error).message}`, 'error');
    }
  }, [updateStatus]);

  const fetchPresets = useCallback(async () => {
    try {
      const loadedPresets = await window.electronAPI.loadPresets();
      setPresets(loadedPresets || {});
    } catch (error) {
      updateStatus(`Error fetching presets: ${(error as Error).message}`, 'error');
    }
  }, [updateStatus]);

  useEffect(() => {
    fetchHalData();
    fetchPresets();

    const cleanupItemUpdates = window.electronAPI.onItemValueUpdated(({ name, value }) => {
      setCurrentWatchList(prevList =>
        prevList.map(item => (item.name === name ? { ...item, value } : item))
      );
    });

    const cleanupLogMessages = window.electronAPI.onLogMessage(({ type, message: logMsg }) => {
      console.log(`Main (${type}): ${logMsg}`);
      if (type === 'error' || logMsg.toLowerCase().includes('error') || logMsg.toLowerCase().includes('failed')) {
        updateStatus(logMsg, 'error');
      } else if (!logMsg.toLowerCase().includes('watch') && !logMsg.toLowerCase().includes('hal service initialized') && !logMsg.toLowerCase().includes('fetched hal data')) {
        updateStatus(logMsg, 'info');
      }
    });

    const cleanupSettingsUpdates = window.electronAPI.onSettingsUpdate((newSettings) => {
      setSettings(newSettings);
      updateStatus(`Settings updated. Watch interval: ${newSettings.watchInterval}ms`, 'info');
    });

    window.electronAPI.getSettings().then(s => {
      if (s) setSettings(s);
    });

    return () => {
      cleanupItemUpdates();
      cleanupLogMessages();
      cleanupSettingsUpdates();
    };
  }, [fetchHalData, fetchPresets, updateStatus]);


  const handleAddToWatchList = useCallback((itemData: HalItemData) => {
    setCurrentWatchList(prevList => {
        if (prevList.find(w => w.name === itemData.name)) {
          updateStatus(`${itemData.name} already in watch list.`, 'warning');
          return prevList;
        }
        const newItem: WatchListItem = {
          name: itemData.name,
          type: (itemData as any).direction ? 'pin' : ((itemData as any).writers !== undefined ? 'signal' : 'param'),
          value: itemData.value,
          dataType: itemData.type,
          dataTypeName: (itemData as any).typeName,
          isWritable: itemData.isWritable,
          details: itemData,
        };
        const newList = [...prevList, newItem];
        window.electronAPI.updateWatchList(newList.map(i => i.name));
        updateStatus(`${itemData.name} added to watch.`, 'success');
        return newList;
    });
  }, [updateStatus]);

  const handleRemoveFromWatchList = useCallback((itemName: string) => {
    setCurrentWatchList(prevList => {
        const newList = prevList.filter(item => item.name !== itemName);
        window.electronAPI.updateWatchList(newList.map(i => i.name));
        updateStatus(`${itemName} removed from watch.`, 'info');
        return newList;
    });
  }, [updateStatus]);
  
  const handleClearWatchList = useCallback(() => {
    setCurrentWatchList([]);
    window.electronAPI.updateWatchList([]);
    updateStatus('Watch list cleared.', 'info');
  }, [updateStatus]);

  const handleSavePreset = useCallback(async (name: string) => {
    if (!name) {
      updateStatus('Preset name cannot be empty.', 'error');
      return;
    }
    if (currentWatchList.length === 0) {
        updateStatus('Watch list is empty, cannot save preset.', 'warning');
        return;
    }
    const items = currentWatchList.map(w => w.name);
    const result = await window.electronAPI.savePreset(name, items);
    if (result.success) {
      setPresets(result.presets);
      updateStatus(`Preset '${name}' saved.`, 'success');
    } else {
      updateStatus('Failed to save preset.', 'error');
    }
  }, [currentWatchList, updateStatus]);

  const handleApplyPreset = useCallback((presetName: string) => {
    const presetItems = presets[presetName];
    if (presetItems && fullHalData) {
        const newWatchList: WatchListItem[] = [];
        presetItems.forEach(itemName => {
            const pin = fullHalData.pins.find(p => p.name === itemName);
            if(pin) { newWatchList.push({ name: pin.name, type: 'pin', value: pin.value, dataType: pin.type, dataTypeName: pin.typeName, isWritable: pin.isWritable, details: pin }); return; }
            const param = fullHalData.params.find(p => p.name === itemName);
            if(param) { newWatchList.push({ name: param.name, type: 'param', value: param.value, dataType: param.type, dataTypeName: param.typeName, isWritable: param.isWritable, details: param }); return; }
            const signal = fullHalData.signals.find(s => s.name === itemName);
            if(signal) { newWatchList.push({ name: signal.name, type: 'signal', value: signal.value, dataType: signal.type, dataTypeName: signal.typeName, isWritable: signal.isWritable, details: signal }); return; }
        });
        setCurrentWatchList(newWatchList);
        window.electronAPI.updateWatchList(newWatchList.map(i => i.name));
        updateStatus(`Preset '${presetName}' applied.`, 'success');
    } else {
        updateStatus(`Could not apply preset '${presetName}'.`, 'error');
    }
  }, [presets, fullHalData, updateStatus]);


  const handleShowTooltip = useCallback((contentProvider: () => string, event: React.MouseEvent) => {
    // Tooltip content can be dynamically generated to avoid passing large objects
    setTooltipContent(contentProvider());
    setTooltipPosition({ x: event.clientX, y: event.clientY });
  }, []);

  const handleHideTooltip = useCallback(() => {
    setTooltipContent(null);
    setTooltipPosition(null);
  }, []);
  
  const handleExecuteCommand = async (command: string, args: any[]) => {
    updateStatus(`Executing: ${command} ${args.join(' ')}...`, 'info');
    const result = await window.electronAPI.executeHalCommand(command, args);
    updateStatus(result.message, result.success ? 'success' : 'error');
    if (result.success) {
      if (command === 'setp' || command === 'sets') {
        const itemToUpdate = args[0] as string;
        const updatedValue = await window.electronAPI.getItemValue(itemToUpdate);
         setCurrentWatchList(prevList =>
            prevList.map(item => (item.name === itemToUpdate ? { ...item, value: updatedValue } : item))
         );
      } else {
         fetchHalData(); // For link/unlink/newsig
      }
    }
  };

  const handleSetWatchInterval = (interval: number) => {
    if (interval && interval >= 50) {
        window.electronAPI.setWatchInterval(interval);
    } else {
        updateStatus('Watch interval must be >= 50ms.', 'warning');
    }
  };

  const toggleTheme = () => {
    setCurrentTheme(currentTheme === 'light' ? 'dark' : 'light');
  };

  return (
    <ConfigProvider theme={{ algorithm: currentTheme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm }}>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider
          width={300}
          theme={currentTheme}
          style={{
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
          }}
        >
          <div style={{ height: 32, margin: 16, background: token.colorPrimary, borderRadius: 6, color: token.colorTextLightSolid, textAlign: 'center', lineHeight: '32px' }}>
            {'HAL Viewer'}
          </div>
          <SidebarComponent
            halData={fullHalData}
            view={sidebarView}
            selectedComponent={selectedComponent}
            onSetView={setSidebarView}
            onSelectComponent={setSelectedComponent}
            onAddToWatchList={handleAddToWatchList}
            onShowTooltip={handleShowTooltip}
            onHideTooltip={handleHideTooltip}
            onRefresh={fetchHalData}
            theme={currentTheme}
          />
        </Sider>        <Layout style={{ marginLeft: 300, transition: 'margin-left 0.2s' }}>
          <Header style={{ 
            padding: '0 16px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            backgroundColor: currentTheme === 'dark' ? '#141414' : '#ffffff',
            borderBottom: `1px solid ${currentTheme === 'dark' ? '#303030' : '#d9d9d9'}`,
            color: currentTheme === 'dark' ? '#ffffff' : '#000000'
          }}>
            <h2 style={{ 
              margin: 0, 
              fontSize: '1.3em', 
            }}>HAL Watch & Control</h2>
            <Button onClick={toggleTheme}>
                Toggle Theme ({currentTheme === 'light' ? 'Dark' : 'Light'})
            </Button>
          </Header>
          <Content style={{ margin: '16px', overflow: 'initial', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 24, borderRadius: token.borderRadiusLG, flexGrow: 1 }}>
              <WatchView
                watchList={currentWatchList}
                presets={presets}
                onRemoveItem={handleRemoveFromWatchList}
                onClearWatchList={handleClearWatchList}
                onSavePreset={handleSavePreset}
                onApplyPreset={handleApplyPreset}
                onShowTooltip={handleShowTooltip}
                onHideTooltip={handleHideTooltip}
                onExecuteCommand={handleExecuteCommand}
              />
            </div>
          </Content>
          <Footer style={{ padding: '10px 16px'  }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '32px'  }}>
              <HalCmdInput
                allHalItemNames={allHalItemNames}
                onExecuteCommand={handleExecuteCommand}
              />
              <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                <StatusBarComponent message={statusMessage} type={statusType} />
                <span style={{whiteSpace: 'nowrap'}}>Interval (ms):</span>
                <InputNumber
                  min={50}
                  step={50}
                  value={settings.watchInterval}
                  onChange={(value) => handleSetWatchInterval(value as number)}
                  style={{width: '80px'}}
                />
              </div>
            </div>
          </Footer>
        </Layout>
        {tooltipContent && tooltipPosition && (
            <TooltipComponent content={tooltipContent} x={tooltipPosition.x} y={tooltipPosition.y} />
        )}
      </Layout>
    </ConfigProvider>
  );
};

export default App;