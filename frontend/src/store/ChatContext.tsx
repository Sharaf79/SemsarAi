import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

interface ChatContextValue {
  isOpen: boolean;
  pendingMessage: string | undefined;
  openChat: (initialMessage?: string) => void;
  closeChat: () => void;
  consumePendingMessage: () => string | undefined;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | undefined>();

  const openChat = useCallback((initialMessage?: string) => {
    setIsOpen(true);
    if (initialMessage) setPendingMessage(initialMessage);
  }, []);

  const closeChat = useCallback(() => setIsOpen(false), []);

  const consumePendingMessage = useCallback((): string | undefined => {
    const msg = pendingMessage;
    setPendingMessage(undefined);
    return msg;
  }, [pendingMessage]);

  return (
    <ChatContext.Provider
      value={{ isOpen, pendingMessage, openChat, closeChat, consumePendingMessage }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChatContext = (): ChatContextValue => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatContext must be used within ChatProvider');
  return ctx;
};
