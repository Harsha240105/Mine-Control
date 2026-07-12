; MineControl OS — Custom Uninstall Data Deletion Script
; Adds a "Delete my servers, settings and account data" checkbox to the uninstaller.
; If the user ticks it, $APPDATA\MineControl OS is deleted on uninstall.
; If left unticked (default), user data is preserved for reinstall recovery.

!macro customUnInstallPage
  ; ---- Variables ----
  Var /GLOBAL DeleteUserDataCheckbox
  Var /GLOBAL DeleteUserDataState

  ; ---- Custom Uninstall Page ----
  Page custom un.DataDeletionPage un.DataDeletionPageLeave

  Function un.DataDeletionPage
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ; Title label
    ${NSD_CreateLabel} 0 0 100% 24u "User Data"
    Pop $0
    CreateFont $1 "$(^Font)" 12 700
    SendMessage $0 ${WM_SETFONT} $1 1

    ; Description
    ${NSD_CreateLabel} 0 28u 100% 40u "Your servers, settings, and account data are stored separately from the application. By default they are KEPT so you can reinstall and continue where you left off."
    Pop $0

    ; Checkbox
    ${NSD_CreateCheckbox} 0 78u 100% 14u "Also delete my servers, settings and account data (cannot be undone)"
    Pop $DeleteUserDataCheckbox
    ${NSD_SetState} $DeleteUserDataCheckbox ${BST_UNCHECKED}

    ; Warning
    ${NSD_CreateLabel} 0 96u 100% 24u "Warning: If checked, your Minecraft servers, worlds, backups, plugins and login account will be permanently deleted."
    Pop $0

    nsDialogs::Show
  FunctionEnd

  Function un.DataDeletionPageLeave
    ${NSD_GetState} $DeleteUserDataCheckbox $DeleteUserDataState
  FunctionEnd
!macroend

!macro customUnInit
  ; Nothing needed
!macroend

!macro customRemoveFiles
  ; Runs AFTER the main application files are removed.
  ; Only delete AppData if the user explicitly ticked the checkbox.
  ${If} $DeleteUserDataState == ${BST_CHECKED}
    DetailPrint "Deleting user data from $APPDATA\MineControl OS ..."
    RMDir /r "$APPDATA\MineControl OS"
    DetailPrint "User data deleted."
  ${Else}
    DetailPrint "User data preserved at: $APPDATA\MineControl OS"
  ${EndIf}
!macroend
