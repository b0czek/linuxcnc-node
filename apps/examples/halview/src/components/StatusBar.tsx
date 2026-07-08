import React from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

interface StatusBarProps {
  message: string;
  type: 'info' | 'error' | 'success' | 'warning';
}

const StatusBarComponent: React.FC<StatusBarProps> = ({ message, type }) => {
  let antType: "secondary" | "danger" | "success" | "warning" = "secondary";
  if (type === 'error') antType = 'danger';
  else if (type === 'success') antType = 'success';
  else if (type === 'warning') antType = 'warning';
  
  return (
    <Text type={antType} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 200, textAlign: 'right' }} title={message}>
      {message}
    </Text>
  );
};

export default StatusBarComponent;