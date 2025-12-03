import React from "react";

export function CustomMenuItem(props) {
  // Destructure hasSubitems out so it doesn't get passed to the div
  // Also destructure className to merge it.
  // Destructure 'key' to avoid spreading it into the div (React warning), and pass it explicitly.
  const { hasSubitems, children, className, key, ...otherProps } = props;

  // Merge incoming className (from Rete) with our custom class
  const combinedClassName = `${className || ""} custom-context-menu-item`.trim();

  return (
    <div key={key} {...otherProps} className={combinedClassName}>
      {children}
      {hasSubitems && <div className="subitem-arrow">▶</div>}
    </div>
  );
}
