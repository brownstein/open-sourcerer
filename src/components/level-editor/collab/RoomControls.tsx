import {
  Alert,
  Box,
  Button,
  Chip,
  ClickAwayListener,
  Divider,
  Grow,
  IconButton,
  Paper,
  Popper,
  Snackbar,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import { LogOut, Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "src/components/ui/icons/Icon";
import { useAppDispatch } from "src/redux/hooks";
import { pushModal } from "src/redux/shared/actions";

import { levelEditorStore } from "../LevelEditorStore";
import { CollabAvatar } from "./CollabAvatar";
import { RoomCodeDisplay } from "./RoomCodeDisplay";
import { BUILD_ID } from "./buildIdentity";
import { CollabMember } from "./collabTypes";
import { levelEditorSession } from "./session";
import { SessionSnapshot, useSessionSnapshot } from "./useSessionSnapshot";

/** Snap the local camera to the peer's cursor. Reads the live awareness
 *  state, not the render snapshot, so the jump lands on fresh coordinates. */
function snapCameraToMember(member: CollabMember): void {
  const live = levelEditorSession
    .getMembers()
    .find((m) => m.clientId === member.clientId);
  const target = (live?.state ?? member.state).presence?.cursor;
  if (!target) return;
  levelEditorStore.setCamera({ x: target.x, y: target.y });
}

// -----------------------------------------------------------------------------
// In-room popover (members, code, leave)
// -----------------------------------------------------------------------------

function RoomPopover({
  anchorEl,
  open,
  onClose,
  session
}: {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  session: SessionSnapshot;
}) {
  const dispatch = useAppDispatch();

  const mismatched = session.members.filter(
    (m) => !m.isSelf && m.state.buildId !== BUILD_ID
  );

  const onEditIdentity = useCallback(() => {
    onClose();
    dispatch(pushModal({ modalName: "collabEditIdentity", modalArg: {} }));
  }, [dispatch, onClose]);

  const onLeave = useCallback(() => {
    onClose();
    dispatch(pushModal({ modalName: "collabLeaveRoom", modalArg: {} }));
  }, [dispatch, onClose]);

  return (
    <Popper
      open={open}
      anchorEl={anchorEl}
      placement="bottom-end"
      transition
      sx={{ zIndex: (theme) => theme.zIndex.modal }}
    >
      {({ TransitionProps }) => (
        <Grow
          {...TransitionProps}
          timeout={{ enter: 120, exit: 0 }}
          style={{ transformOrigin: "top right" }}
        >
          <Paper elevation={6} sx={{ borderRadius: 1.5, width: 280 }}>
            <ClickAwayListener
              onClickAway={(event) => {
                if (anchorEl?.contains(event.target as Node)) return;
                onClose();
              }}
            >
              <Stack spacing={1} sx={{ p: 1.25 }}>
                <Box
                  sx={{
                    position: "relative",
                    display: "flex",
                    justifyContent: "center"
                  }}
                >
                  <RoomCodeDisplay code={session.roomCode ?? ""} compact />
                  <Tooltip title="Leave room">
                    <IconButton
                      size="small"
                      onClick={onLeave}
                      sx={{ position: "absolute", top: 0, right: 0 }}
                    >
                      <LogOut size={15} />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Divider />
                {session.signalingDown && (
                  <Alert severity="warning">
                    Can't reach the connection servers right now, so nobody new
                    will be able to join.
                  </Alert>
                )}
                <Stack spacing={0.25}>
                  {session.members.map((member) => (
                    <Stack
                      key={member.clientId}
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      onClick={() => {
                        if (!member.isSelf) snapCameraToMember(member);
                      }}
                      sx={{
                        px: 0.75,
                        py: 0.5,
                        borderRadius: 1,
                        cursor: member.isSelf ? "default" : "pointer",
                        "&:hover": {
                          bgcolor: member.isSelf ? undefined : "action.hover"
                        }
                      }}
                    >
                      <CollabAvatar
                        identity={member.state.identity}
                        size={24}
                        dimmed={member.state.away || member.idle}
                      />
                      <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                        {member.state.identity.name}
                      </Typography>
                      {member.isSelf && (
                        <>
                          <Chip label="you" size="small" sx={{ height: 18 }} />
                          <Tooltip title="Edit name and avatar">
                            <IconButton size="small" onClick={onEditIdentity}>
                              <Pencil size={13} />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </Stack>
                  ))}
                </Stack>
                {mismatched.length > 0 && (
                  <Typography variant="caption" color="warning.main">
                    {mismatched
                      .map(
                        (m) =>
                          `You're on ${BUILD_ID}, ${m.state.identity.name} is on ${m.state.buildId}`
                      )
                      .join(". ")}
                  </Typography>
                )}
              </Stack>
            </ClickAwayListener>
          </Paper>
        </Grow>
      )}
    </Popper>
  );
}

// -----------------------------------------------------------------------------
// Toolbar entry point: avatar row + Room button + attached surfaces
// -----------------------------------------------------------------------------

export function RoomControls() {
  const dispatch = useAppDispatch();
  const session = useSessionSnapshot();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onJoined = ({ name }: { name: string }) =>
      setToastMessage(`${name} joined the room`);
    const onLeft = ({ name }: { name: string }) =>
      setToastMessage(`${name} left the room`);
    levelEditorSession.events.on("memberJoined", onJoined);
    levelEditorSession.events.on("memberLeft", onLeft);
    return () => {
      levelEditorSession.events.off("memberJoined", onJoined);
      levelEditorSession.events.off("memberLeft", onLeft);
    };
  }, []);

  const inRoom = session.phase === "in-room";
  const others = session.members.filter((m) => !m.isSelf);

  return (
    <>
      {inRoom && others.length > 0 && (
        <>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {others.map((member) => (
              <CollabAvatar
                key={member.clientId}
                identity={member.state.identity}
                size={26}
                dimmed={member.state.away || member.idle}
                tooltip={member.state.identity.name}
                onClick={() => snapCameraToMember(member)}
              />
            ))}
          </Stack>
          <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />
        </>
      )}
      <Tooltip
        title={
          inRoom
            ? `In a room (${session.members.length} member${
                session.members.length === 1 ? "" : "s"
              })`
            : "Start or join a collaborative room"
        }
      >
        <Button
          ref={buttonRef}
          variant="outlined"
          color={inRoom ? "primary" : "inherit"}
          size="small"
          sx={{ textTransform: "none" }}
          startIcon={<Icon icon="globeStroked" size="font" />}
          onClick={() => {
            if (inRoom) {
              setPopoverOpen((prev) => !prev);
            } else {
              dispatch(pushModal({ modalName: "collabRoom", modalArg: {} }));
            }
          }}
          data-testid="editor-room"
        >
          Room
        </Button>
      </Tooltip>

      <RoomPopover
        anchorEl={buttonRef.current}
        open={popoverOpen && inRoom}
        onClose={() => setPopoverOpen(false)}
        session={session}
      />
      <Snackbar
        open={toastMessage !== null}
        autoHideDuration={3000}
        onClose={() => setToastMessage(null)}
        message={toastMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      />
    </>
  );
}
