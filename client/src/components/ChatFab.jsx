import Icon from "../Icon.jsx";

export default function ChatFab({ onClick, label = "Ask AI" }) {
  return (
    <button className="chat-fab" onClick={onClick}>
      <Icon name="chatbubble-ellipses" size={20} color="#fff" />
      {label}
    </button>
  );
}
