import React from "react";

type ImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  priority?: boolean;
};

export default function Image({ priority: _priority, ...props }: ImageProps) {
  void _priority;
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" {...props} />;
}
