import React, { forwardRef, ElementType } from "react";
import { Link as MuiLink, LinkProps as MuiLinkProps } from "@mui/material";
import NextLink from "next/link";

export interface LinkProps extends Omit<MuiLinkProps, 'href'> {
  href: string;
  disabled?: boolean;
  external?: boolean;
}
const Link = forwardRef<HTMLAnchorElement, LinkProps>((props: LinkProps, ref) => {
  const { href, disabled, external, children, ...rest } = props;

  const anchorProps = {
    'aria-disabled': disabled,
    tabIndex: disabled ? -1 : 0,
    ...rest,
    ref,
  };

  if (external) {
    return (
      <MuiLink
        target="_blank"
        rel="noreferrer noopener"
        {...anchorProps}
      >
        {children}
      </MuiLink>
    );
  } else {
    return (
      <MuiLink
        component={NextLink as ElementType}
        href={href}
        {...anchorProps}
      >
        {children}
      </MuiLink>
    );
  }
});
Link.displayName = "Link";
export default Link;
