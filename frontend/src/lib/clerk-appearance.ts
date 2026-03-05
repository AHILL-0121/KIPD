// lib/clerk-appearance.ts
// This maps ALL Clerk component tokens to the Kipd design system.
// No purple, no blue — pure amber, terracotta, stone.

import type { Appearance } from "@clerk/types";

export const kipd_clerkAppearance: Appearance = {
  layout: {
    // Hide Clerk's default logo — we show Kip instead
    logoPlacement: "none",
    showOptionalFields: true,
    // Hide social buttons (Google OAuth)
    socialButtonsVariant: "blockButton",
    socialButtonsPlacement: "top",
  },
  variables: {
    // ── Core brand colors ─────────────────────────────
    colorPrimary:           "#E8A020",   // Amber — all primary actions

    colorDanger:   "#C8573A",            // Terracotta — errors
    colorSuccess:  "#5E8C6A",            // Sage — success
    colorWarning:  "#E8A020",            // Amber — warnings

    // ── Background ────────────────────────────────────
    colorBackground:        "#FFFFFF",
    colorInputBackground:   "#FFFFFF",

    // ── Text ──────────────────────────────────────────
    colorText:              "#1A1410",
    colorTextSecondary:     "#6B5D52",

    // ── Input borders ─────────────────────────────────
    colorInputText:         "#1A1410",

    // ── Shapes & sizing ───────────────────────────────
    borderRadius:           "12px",
    fontFamily:             "'DM Sans', sans-serif",
    fontFamilyButtons:      "'DM Sans', sans-serif",

    // ── Font sizes ────────────────────────────────────
    fontSize:               "0.9rem",

    // ── Spacing ───────────────────────────────────────
    spacingUnit:            "4px",
  },

  elements: {
    // ── Outer card ────────────────────────────────────
    card: {
      boxShadow:    "none",
      border:       "none",
      borderRadius: "0",
      padding:      "0",
      background:   "transparent",
      width:        "100%",
      maxWidth:     "380px",
    },
    cardBox: {
      boxShadow: "none",
      border:    "none",
      padding:   "0",
    },

    // ── Root ──────────────────────────────────────────
    rootBox: {
      width: "100%",
      maxWidth: "380px",
    },

    // ── Header (hide — we have our own) ───────────────
    header:       { display: "none" },
    headerTitle:  { display: "none" },
    headerSubtitle: { display: "none" },
    logoBox:      { display: "none" },
    logoImage:    { display: "none" },

    // ── Main form container ───────────────────────────
    main: {
      gap: "0",
      padding: "0",
      width: "100%",
    },
    
    // ── Form container ────────────────────────────────
    formContainer: {
      gap: "20px",
      width: "100%",
    },
    
    formFieldRow: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "8px",
      marginBottom: "20px",
    },

    // ── Social buttons (hidden) ───────────────────────
    socialButtons: {
      display: "none",
    },
    socialButtonsBlockButton: {
      display: "none",
    },
    socialButtonsBlockButtonText: {
      display: "none",
    },
    socialButtonsProviderIcon: {
      display: "none",
    },

    // ── Divider (hidden when no social buttons) ───────
    dividerRow: {
      display: "none",
    },
    dividerLine: {
      background: "#E8E0D0",
    },
    dividerText: {
      color:      "#A89880",
      fontSize:   "0.72rem",
      fontFamily: "'DM Mono', monospace",
      letterSpacing: "0.08em",
    },

    // ── Form fields ───────────────────────────────────
    formFieldLabel: {
      fontSize:   "0.78rem",
      fontWeight: "500",
      color:      "#3D322A",
      marginBottom: "6px",
      display: "block",
    },
    formFieldInput: {
      border:         "1.5px solid #E8E0D0",
      borderRadius:   "12px",
      padding:        "12px 16px",
      fontSize:       "0.9rem",
      color:          "#1A1410",
      background:     "white",
      transition:     "all 0.2s ease",
      outline:        "none",
      width:          "100%",
      "&:focus": {
        borderColor: "#E8A020",
        boxShadow:   "0 0 0 3px rgba(232,160,32,0.13)",
      },
      "&::placeholder": {
        color: "#C8BBA8",
      },
    },
    formFieldInputShowPasswordButton: {
      color: "#A89880",
      "&:hover": {
        color: "#6B5D52",
      },
    },
    formFieldAction: {
      color: "#A89880",
      fontSize: "0.75rem",
      textDecoration: "none",
      transition: "color 0.2s",
      "&:hover": {
        color: "#C47A10",
      },
    },
    formFieldSuccessText: {
      color: "#5E8C6A",
    },
    formFieldErrorText: {
      color:    "#C8573A",
      fontSize: "0.75rem",
    },
    formFieldWarningText: {
      color: "#E8A020",
    },

    // ── Primary action button ─────────────────────────
    formButtonPrimary: {
      background:    "#E8A020",
      color:         "#1A1410",
      fontWeight:    "600",
      fontSize:      "0.9rem",
      letterSpacing: "0.02em",
      borderRadius:  "12px",
      padding:       "13px 24px",
      border:        "none",
      boxShadow:     "0 4px 16px rgba(232,160,32,0.35)",
      transition:    "all 0.25s cubic-bezier(.34,1.56,.64,1)",
      width:         "100%",
      marginTop:     "8px",
      "&:hover": {
        background: "#D4901A",
        transform:  "translateY(-2px)",
        boxShadow:  "0 8px 28px rgba(232,160,32,0.45)",
      },
      "&:active": {
        transform: "scale(0.98)",
      },
    },

    // ── Secondary buttons ─────────────────────────────
    formButtonReset: {
      color: "#6B5D52",
    },

    // ── Footer / links ────────────────────────────────
    footer: {
      background:   "transparent",
      padding:      "0",
      marginTop:    "24px",
      textAlign:    "center",
    },
    footerActionText: {
      color:    "#6B5D52",
      fontSize: "0.8rem",
    },
    footerActionLink: {
      color:          "#C47A10",
      fontWeight:     "500",
      textDecoration: "none",
      "&:hover": {
        color: "#C8573A",
      },
    },
    footerPages: {
      background: "transparent",
    },

    // ── Verification / OTP ────────────────────────────
    otpCodeFieldInput: {
      border:       "1.5px solid #E8E0D0",
      borderRadius: "10px",
      fontSize:     "1.1rem",
      fontWeight:   "600",
      color:        "#1A1410",
      "&:focus": {
        borderColor: "#E8A020",
        boxShadow:   "0 0 0 3px rgba(232,160,32,0.15)",
      },
    },

    // ── Alert / error banners ─────────────────────────
    alertText: {
      color:    "#C8573A",
      fontSize: "0.8rem",
    },
    alert: {
      background:   "#FBE8E3",
      borderColor:  "#E07A60",
      borderRadius: "10px",
    },

    // ── Internal badge ────────────────────────────────
    badge: {
      background:   "#FDF3DC",
      color:        "#C47A10",
      borderRadius: "99px",
      fontSize:     "0.68rem",
    },

    // ── Clerk branding ────────────────────────────────
    // Move it to bottom, muted
    internal__clerk_branding: {
      opacity:    "0.35",
      filter:     "grayscale(1)",
      marginTop:  "20px",
      fontSize:   "0.65rem",
    },
  },
};
