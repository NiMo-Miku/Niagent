; Included from customHeader, after the upstream CHECK_APP_RUNNING is defined.
; Compile that macro once: it contains global declarations and fixed labels.
Function QQAgentCheckInstallRunning
  ; Reject malformed registry paths before the upstream prefix-based process
  ; check can act on them. The preservation helper validates them again later.
  ${If} $INSTDIR == ""
    Goto qqagent_invalid_process_root
  ${EndIf}
  System::Call 'shlwapi::PathIsRelativeW(w "$INSTDIR") i.r1'
  ${If} $1 != 0
    Goto qqagent_invalid_process_root
  ${EndIf}
  ; $INSTDIR strips a trailing slash, so a supplied C:\ can become C:.
  ; Reject drive-relative/root-relative inputs before GetFullPathName could
  ; resolve them against the current directory and conceal the invalid root.
  StrCpy $1 "$INSTDIR" 2
  ${If} $1 != "\\"
    System::Call 'shlwapi::PathGetDriveNumberW(w "$INSTDIR") i.r1'
    ${If} $1 < 0
      Goto qqagent_invalid_process_root
    ${EndIf}
    StrCpy $1 "$INSTDIR" 1 2
    ${If} $1 != "\"
    ${AndIf} $1 != "/"
      Goto qqagent_invalid_process_root
    ${EndIf}
  ${EndIf}
  System::Call 'shlwapi::PathIsRootW(w "$INSTDIR") i.r1'
  ${If} $1 != 0
    Goto qqagent_invalid_process_root
  ${EndIf}
  ClearErrors
  GetFullPathName $0 "$INSTDIR"
  IfErrors qqagent_invalid_process_root
  ${If} $0 == ""
    Goto qqagent_invalid_process_root
  ${EndIf}
  System::Call 'shlwapi::PathIsRootW(w r0) i.r1'
  ${If} $1 != 0
    Goto qqagent_invalid_process_root
  ${EndIf}
  StrCpy $INSTDIR "$0"
  !insertmacro CHECK_APP_RUNNING
  Return

  qqagent_invalid_process_root:
    DetailPrint "Invalid installation directory; process shutdown and installation were stopped."
    ${IfNot} ${Silent}
      MessageBox MB_ICONSTOP|MB_OK "QQ Agent found an invalid installation directory. Installation stopped without closing running applications or removing the old version."
    ${EndIf}
    SetErrorLevel 2
    Abort
FunctionEnd

!macroundef CHECK_APP_RUNNING
!macro CHECK_APP_RUNNING
  Call QQAgentCheckInstallRunning
!macroend
