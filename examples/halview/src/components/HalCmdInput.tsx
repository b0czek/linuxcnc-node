import React, { useState } from 'react';
import { Input, Button, AutoComplete, Space } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';

interface HalCmdInputProps {
  allHalItemNames: string[];
  onExecuteCommand: (command: string, args: any[]) => void;
}

const PREDEFINED_COMMANDS = [
  { label: "Predefined...", value: ""},
  { label: "setp name value", value: "setp " },
  { label: "sets name value", value: "sformatterets " },
  { label: "linkps pin signal", value: "linkps " },
  { label: "unlinkp pin", value: "unlinkp " },
  { label: "newsig name type", value: "newsig " },
];

const HalCmdInput: React.FC<HalCmdInputProps> = ({ allHalItemNames, onExecuteCommand }) => {
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState<{ value: string }[]>([]);


  const handleSearch = (searchText: string) => {
    if (!searchText) {
      setOptions([]);
    } else {
      const filtered = allHalItemNames
        .filter(name => name.toLowerCase().includes(searchText.toLowerCase()))
        .map(name => ({ value: name }));
      
      PREDEFINED_COMMANDS.forEach(cmd => {
        if (cmd.value && cmd.value.toLowerCase().startsWith(searchText.toLowerCase())) {
            if (!filtered.find(opt => opt.value === cmd.value.trim())) {
                 filtered.unshift({ value: cmd.value.trim() });
            }
        }
      });
      setOptions(filtered.slice(0, 10));
    }
  };

  const onSelectAutoComplete = (data: string) => {
    const currentCommandPart = inputValue.split(' ')[0];
    if (PREDEFINED_COMMANDS.find(cmd => cmd.value.trim() === currentCommandPart)) {
        setInputValue(`${currentCommandPart} ${data} `);
    } else {
        setInputValue(data + ' ');
    }
  };


  const handleExecute = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);
    onExecuteCommand(command, args);
    // do not clean the input, the user might want to modify it
  };


  return (
    <Space.Compact style={{ width: '100%' }}>

      <AutoComplete
        value={inputValue}
        options={options}
        style={{ width: '100%' }}
        onSelect={onSelectAutoComplete}
        onSearch={handleSearch}
        onChange={setInputValue}
        placeholder="e.g., setp classicladder.0.in-00 true"
      >
        <Input onPressEnter={handleExecute} allowClear />
      </AutoComplete>
      <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleExecute}>
        Execute
      </Button>
    </Space.Compact>
  );
};

export default HalCmdInput;