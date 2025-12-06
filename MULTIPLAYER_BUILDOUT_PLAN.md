# 4x4 Builder - Multiplayer Buildout Plan

## Executive Summary

This document outlines a comprehensive plan to add real-time multiplayer functionality to 4x4 Builder, enabling players to see and drive with other players and their custom vehicle configurations. The implementation preserves all existing functionality while adding a networked multiplayer layer.

---

## Table of Contents

1. [Current Architecture Audit](#current-architecture-audit)
2. [Multiplayer Architecture Overview](#multiplayer-architecture-overview)
3. [Backend Infrastructure](#backend-infrastructure)
4. [State Synchronization Strategy](#state-synchronization-strategy)
5. [Vehicle Configuration Sync](#vehicle-configuration-sync)
6. [Physics & Movement Sync](#physics--movement-sync)
7. [New Component Architecture](#new-component-architecture)
8. [Implementation Phases](#implementation-phases)
9. [Technical Considerations](#technical-considerations)
10. [File Structure Changes](#file-structure-changes)

---

## Current Architecture Audit

### Core Systems Analysis

#### 1. State Management (`store/`)
- **`gameStore.js`**: Central Zustand store managing:
  - Scene state (loading, physics enabled, performance)
  - Camera state (target, controls ref, auto-rotate)
  - XR state (origin ref, inside vehicle)
  - Vehicle configuration (`currentVehicle` object with 15+ properties)
  - Saved vehicles (localStorage persistence)
  - Notifications and UI state
  
- **`inputStore.js`**: Input abstraction layer managing:
  - Keyboard keys (Set-based)
  - Unified input object (axes, triggers, buttons)
  - Touch input (joystick values)

#### 2. Vehicle System (`components/scene/`)
- **`Vehicle.jsx`**: Complete vehicle renderer including:
  - Physics-enabled RigidBody with Rapier
  - Dynamic wheel system (Rim, Tire, Wheels components)
  - Body with addons support
  - Engine audio and dust particles
  - XR seat positioning
  
- **`VehicleManager.jsx`**: Bridge between store and Vehicle component
  - Reads all config properties from `gameStore`
  - Passes them as props to `Vehicle`

- **`useVehiclePhysics.js`**: Physics hook (566 lines) handling:
  - Rapier vehicle controller setup
  - Engine/transmission simulation
  - Wheel physics and suspension
  - Input-to-force conversion
  - Airborne controls

#### 3. Configuration System (`vehicleConfigs.js`)
- 288 lines of vehicle definitions including:
  - 11 vehicle bodies with unique properties
  - 11 rim types with dimensions
  - 5 tire types with scaling data
  - Default configuration object
  - Addon system with nested options

#### 4. Input System (`components/scene/InputManager.jsx`)
- Unified input polling for:
  - Keyboard (event-based)
  - Standard gamepads (polled)
  - XR controllers (polled)
- All inputs normalized and combined

#### 5. Scene/Environment (`components/scene/`)
- `Canvas.jsx`: R3F Canvas with Physics wrapper
- `CameraControls.jsx`: OrbitControls with chase cam
- `Environment.jsx`: Sky, terrain, lighting
- `XRManager.jsx`: XR session and origin management

#### 6. UI System (`components/ui/`)
- `Editor.jsx`: Full vehicle customization UI
- `Actions.jsx`: Save, share, screenshot actions
- `VehicleSwitcher.jsx`: Saved vehicle management
- `Sidebar.jsx`, `Header.jsx`: Layout components

### Key Observations for Multiplayer

1. **Single-vehicle assumption**: Current architecture assumes one vehicle, one player
2. **Local state**: All state is local (Zustand + localStorage)
3. **Direct physics control**: Vehicle physics runs locally with direct input
4. **No network layer**: No WebSocket or network code exists
5. **Mutable refs for performance**: Engine state uses refs to avoid re-renders
6. **Frame-based updates**: Physics and input processed in `useFrame`

---

## Multiplayer Architecture Overview

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                             │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │
│  │ Local       │  │ Network     │  │ Remote Players              │  │
│  │ Vehicle     │  │ Manager     │  │ Manager                     │  │
│  │             │  │             │  │ ┌─────────┐ ┌─────────┐     │  │
│  │ - Physics   │◄─┤ - WebSocket │◄─┤ │Player 2 │ │Player 3 │ ... │  │
│  │ - Controls  │  │ - Room Mgmt │  │ └─────────┘ └─────────┘     │  │
│  │ - Full Sim  │  │ - State Sync│  │ (Interpolated/Visual Only)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ WebSocket (wss://)
┌─────────────────────────────────────────────────────────────────────┐
│                         SERVER (Node.js)                             │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │
│  │ Room        │  │ State       │  │ Message                     │  │
│  │ Manager     │  │ Authority   │  │ Router                      │  │
│  │             │  │             │  │                             │  │
│  │ - Create    │  │ - Validate  │  │ - Position updates          │  │
│  │ - Join      │  │ - Broadcast │  │ - Config changes            │  │
│  │ - Leave     │  │ - Rate limit│  │ - Player events             │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Sync Strategy: Client-Authoritative with Validation

Given that this is a non-competitive game, we use **client-authoritative physics** where:
- Each client runs full physics simulation for their own vehicle
- Position/rotation is broadcast to other clients
- Server validates and relays messages (no physics simulation)
- Remote vehicles are interpolated visually (no physics)

---

## Backend Infrastructure

### Server Technology Stack

```javascript
// Recommended stack
{
  "runtime": "Node.js 20+",
  "websocket": "ws (or Socket.io for fallback support)",
  "hosting": "Fly.io / Railway / Render (WebSocket support)",
  "optional": {
    "persistence": "Redis (room state, reconnection)",
    "monitoring": "Prometheus + Grafana"
  }
}
```

### Server File Structure

```
server/
├── package.json
├── index.js                 # Entry point
├── src/
│   ├── WebSocketServer.js   # WS connection handling
│   ├── RoomManager.js       # Room creation/joining logic
│   ├── Player.js            # Player state class
│   ├── MessageHandler.js    # Message routing
│   ├── Validator.js         # Input validation
│   └── types.js             # TypeScript-like type definitions
└── config/
    └── settings.js          # Rate limits, room sizes, etc.
```

### Server Core Implementation

```javascript
// server/src/RoomManager.js
class RoomManager {
  constructor() {
    this.rooms = new Map()      // roomId -> Room
    this.playerRooms = new Map() // playerId -> roomId
  }

  createRoom(hostId) {
    const roomId = generateRoomCode() // e.g., "ABCD-1234"
    const room = {
      id: roomId,
      host: hostId,
      players: new Map(),
      createdAt: Date.now(),
      settings: { maxPlayers: 8 }
    }
    this.rooms.set(roomId, room)
    return room
  }

  joinRoom(roomId, playerId, playerData) {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')
    if (room.players.size >= room.settings.maxPlayers) {
      throw new Error('Room is full')
    }
    room.players.set(playerId, {
      id: playerId,
      vehicleConfig: playerData.vehicleConfig,
      transform: { position: [0, 1, 0], rotation: [0, 0, 0, 1] },
      lastUpdate: Date.now()
    })
    this.playerRooms.set(playerId, roomId)
    return room
  }

  leaveRoom(playerId) {
    const roomId = this.playerRooms.get(playerId)
    if (!roomId) return
    const room = this.rooms.get(roomId)
    if (room) {
      room.players.delete(playerId)
      // Clean up empty rooms
      if (room.players.size === 0) {
        this.rooms.delete(roomId)
      }
    }
    this.playerRooms.delete(playerId)
  }
}
```

### Message Protocol

```typescript
// Message Types (TypeScript notation for clarity)
type MessageType = 
  | 'join_room'
  | 'leave_room'
  | 'room_state'
  | 'player_joined'
  | 'player_left'
  | 'player_update'      // Position/rotation (high frequency)
  | 'vehicle_config'     // Full config (low frequency)
  | 'vehicle_reset'      // Reset position
  | 'ping' | 'pong'

interface PlayerUpdate {
  type: 'player_update'
  playerId: string
  timestamp: number
  position: [number, number, number]
  rotation: [number, number, number, number]  // Quaternion
  velocity: [number, number, number]
  wheelRotations: [number, number, number, number]
  steering: number
  engineRpm: number
}

interface VehicleConfigMessage {
  type: 'vehicle_config'
  playerId: string
  config: {
    body: string
    color: string
    roughness: number
    lift: number
    wheel_offset: number
    rim: string
    rim_diameter: number
    rim_width: number
    rim_color: string
    rim_color_secondary: string
    tire: string
    tire_diameter: number
    tire_muddiness: number
    addons: Record<string, string>
  }
}
```

---

## State Synchronization Strategy

### New Store Architecture

```javascript
// store/multiplayerStore.js (NEW)
import { create } from 'zustand'

const useMultiplayerStore = create((set, get) => ({
  // Connection state
  connected: false,
  connecting: false,
  connectionError: null,
  
  // Player identity
  localPlayerId: null,
  playerName: 'Player',
  
  // Room state
  currentRoom: null,
  isHost: false,
  
  // Remote players (Map: playerId -> playerState)
  remotePlayers: new Map(),
  
  // Network manager reference
  networkManager: null,
  
  // Actions
  setConnected: (connected) => set({ connected }),
  setLocalPlayerId: (id) => set({ localPlayerId: id }),
  
  setCurrentRoom: (room) => set({ 
    currentRoom: room,
    isHost: room?.host === get().localPlayerId 
  }),
  
  updateRemotePlayer: (playerId, data) => set((state) => {
    const newPlayers = new Map(state.remotePlayers)
    const existing = newPlayers.get(playerId) || {}
    newPlayers.set(playerId, { ...existing, ...data, lastUpdate: Date.now() })
    return { remotePlayers: newPlayers }
  }),
  
  removeRemotePlayer: (playerId) => set((state) => {
    const newPlayers = new Map(state.remotePlayers)
    newPlayers.delete(playerId)
    return { remotePlayers: newPlayers }
  }),
  
  clearRemotePlayers: () => set({ remotePlayers: new Map() }),
}))

export default useMultiplayerStore
```

### Data Flow

```
┌────────────────────────────────────────────────────────────────┐
│                    LOCAL PLAYER DATA FLOW                       │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  InputManager ──► useVehiclePhysics ──► Vehicle Position       │
│                                              │                  │
│                                              ▼                  │
│                                    NetworkManager.broadcast()   │
│                                              │                  │
│                                              ▼                  │
│                                    WebSocket ──► Server         │
│                                                                 │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                   REMOTE PLAYER DATA FLOW                       │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Server ──► WebSocket ──► NetworkManager.onMessage()           │
│                                    │                            │
│                                    ▼                            │
│                          multiplayerStore.updateRemotePlayer()  │
│                                    │                            │
│                                    ▼                            │
│                          RemoteVehicle (interpolated render)    │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## Vehicle Configuration Sync

### Config Change Detection

```javascript
// hooks/useConfigSync.js (NEW)
import { useEffect, useRef } from 'react'
import useGameStore from '../store/gameStore'
import useMultiplayerStore from '../store/multiplayerStore'

export function useConfigSync() {
  const currentVehicle = useGameStore((state) => state.currentVehicle)
  const networkManager = useMultiplayerStore((state) => state.networkManager)
  const connected = useMultiplayerStore((state) => state.connected)
  
  const prevConfigRef = useRef(null)
  
  useEffect(() => {
    if (!connected || !networkManager) return
    
    // Deep compare config (or use hash)
    const configString = JSON.stringify(currentVehicle)
    if (configString !== prevConfigRef.current) {
      prevConfigRef.current = configString
      
      // Broadcast config change
      networkManager.send({
        type: 'vehicle_config',
        config: currentVehicle
      })
    }
  }, [currentVehicle, connected, networkManager])
}
```

### Remote Vehicle Configuration Handling

Remote players receive full configs and must:
1. Pre-load required models (body, rim, tire, addons)
2. Display loading state until assets ready
3. Apply visual configuration without physics

---

## Physics & Movement Sync

### Local Player Broadcasting

```javascript
// hooks/useTransformBroadcast.js (NEW)
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import useMultiplayerStore from '../store/multiplayerStore'

const BROADCAST_RATE = 1000 / 20 // 20 updates per second

export function useTransformBroadcast(chassisRef, wheelRefs) {
  const networkManager = useMultiplayerStore((state) => state.networkManager)
  const connected = useMultiplayerStore((state) => state.connected)
  const lastBroadcast = useRef(0)
  
  useFrame((state) => {
    if (!connected || !networkManager || !chassisRef.current) return
    
    const now = performance.now()
    if (now - lastBroadcast.current < BROADCAST_RATE) return
    lastBroadcast.current = now
    
    const position = chassisRef.current.translation()
    const rotation = chassisRef.current.rotation()
    const velocity = chassisRef.current.linvel()
    
    // Get wheel rotations
    const wheelRotations = wheelRefs.map(ref => 
      ref.current?.rotation?.x || 0
    )
    
    networkManager.send({
      type: 'player_update',
      timestamp: now,
      position: [position.x, position.y, position.z],
      rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
      velocity: [velocity.x, velocity.y, velocity.z],
      wheelRotations,
      steering: 0, // Extract from vehicle controller
      engineRpm: useGameStore.getState().engineRef.rpm
    })
  })
}
```

### Remote Player Interpolation

```javascript
// components/scene/RemoteVehicle.jsx (NEW)
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, Quaternion } from 'three'

// Interpolation buffer for smooth movement
class TransformBuffer {
  constructor(bufferSize = 3) {
    this.buffer = []
    this.bufferSize = bufferSize
  }
  
  push(transform) {
    this.buffer.push({ ...transform, receivedAt: performance.now() })
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift()
    }
  }
  
  interpolate(renderTime, interpolationDelay = 100) {
    const targetTime = renderTime - interpolationDelay
    
    // Find surrounding samples
    let before = null, after = null
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i].timestamp <= targetTime) {
        before = this.buffer[i]
      } else {
        after = this.buffer[i]
        break
      }
    }
    
    if (!before) return after || this.buffer[0]
    if (!after) return before
    
    // Interpolate between samples
    const t = (targetTime - before.timestamp) / (after.timestamp - before.timestamp)
    return this.lerp(before, after, Math.max(0, Math.min(1, t)))
  }
  
  lerp(a, b, t) {
    return {
      position: a.position.map((v, i) => v + (b.position[i] - v) * t),
      rotation: this.slerpQuat(a.rotation, b.rotation, t),
      wheelRotations: a.wheelRotations.map((v, i) => v + (b.wheelRotations[i] - v) * t),
      steering: a.steering + (b.steering - a.steering) * t,
      engineRpm: a.engineRpm + (b.engineRpm - a.engineRpm) * t
    }
  }
  
  slerpQuat(a, b, t) {
    // Simplified slerp - use THREE.Quaternion for production
    const qa = new Quaternion(...a)
    const qb = new Quaternion(...b)
    qa.slerp(qb, t)
    return [qa.x, qa.y, qa.z, qa.w]
  }
}

const RemoteVehicle = ({ playerId, initialConfig, initialTransform }) => {
  const groupRef = useRef()
  const bufferRef = useRef(new TransformBuffer())
  
  // Subscribe to updates for this player
  // ... (subscribe to multiplayerStore updates for this playerId)
  
  useFrame(() => {
    if (!groupRef.current) return
    
    const interpolated = bufferRef.current.interpolate(performance.now())
    if (interpolated) {
      groupRef.current.position.set(...interpolated.position)
      groupRef.current.quaternion.set(...interpolated.rotation)
      // Update wheel rotations...
    }
  })
  
  return (
    <group ref={groupRef}>
      {/* Render vehicle body, wheels, etc. using config */}
      {/* Similar to Vehicle.jsx but WITHOUT physics RigidBody */}
    </group>
  )
}
```

---

## New Component Architecture

### Modified/New Files Overview

```
src/
├── store/
│   ├── gameStore.js           # (Modified) Add network-aware methods
│   ├── inputStore.js          # (Unchanged)
│   └── multiplayerStore.js    # (NEW) Multiplayer state
│
├── network/                    # (NEW) Network layer
│   ├── NetworkManager.js       # WebSocket manager
│   ├── MessageHandler.js       # Message routing
│   ├── protocols.js            # Message type definitions
│   └── compression.js          # Optional: message compression
│
├── components/
│   ├── scene/
│   │   ├── Vehicle.jsx              # (Modified) Add broadcast hook
│   │   ├── VehicleManager.jsx       # (Modified) Manage local + remote
│   │   ├── RemoteVehicle.jsx        # (NEW) Visual-only vehicle
│   │   ├── RemoteVehicleManager.jsx # (NEW) Manage all remote vehicles
│   │   └── ... (other scene unchanged)
│   │
│   └── ui/
│       ├── MultiplayerPanel.jsx    # (NEW) Join/create room UI
│       ├── PlayerList.jsx          # (NEW) Show connected players
│       ├── RoomCode.jsx            # (NEW) Display/copy room code
│       └── ... (other UI mostly unchanged)
│
├── hooks/
│   ├── useVehiclePhysics.js    # (Unchanged) Local physics only
│   ├── useTransformBroadcast.js # (NEW) Position broadcasting
│   ├── useConfigSync.js        # (NEW) Config change sync
│   └── useNetworkConnection.js # (NEW) Connection management
│
└── ...
```

### Component Hierarchy (Multiplayer)

```jsx
<App>
  <Header>
    <VehicleSwitcher />
    <RoomCode />          {/* NEW: Shows room code when in room */}
    <PlayerList />        {/* NEW: Shows connected players */}
  </Header>
  
  <Canvas>
    <Physics>
      <VehicleManager>
        <Vehicle />                    {/* Local player - full physics */}
      </VehicleManager>
      
      <RemoteVehicleManager>           {/* NEW */}
        <RemoteVehicle playerId="..." /> {/* Remote - visual only */}
        <RemoteVehicle playerId="..." />
        ...
      </RemoteVehicleManager>
      
      <Environment />
    </Physics>
  </Canvas>
  
  <Sidebar>
    <Editor />
    <MultiplayerPanel />    {/* NEW: Join/create/leave room */}
  </Sidebar>
  
  <Actions />
</App>
```

---

## Implementation Phases

### Phase 1: Foundation ✅ COMPLETE

#### 1.1 Network Infrastructure ✅
- [x] Create `server/` directory with Node.js WebSocket server
- [x] Implement `RoomManager` with create/join/leave
- [x] Define message protocol and types
- [x] Add basic validation and rate limiting

#### 1.2 Client Network Layer ✅
- [x] Create `network/NetworkManager.js`
- [x] Create `store/multiplayerStore.js`
- [x] Implement connection handling (connect/disconnect/reconnect)
- [x] Add ping/pong for latency measurement

#### 1.3 Basic Room UI ✅
- [x] Create `MultiplayerPanel.jsx` with create/join buttons
- [x] Create `RoomCode.jsx` to display shareable code
- [x] Add connection status indicator

### Phase 2: Vehicle Sync ✅ COMPLETE

#### 2.1 Local Player Broadcasting ✅
- [x] Create `useTransformBroadcast.js` hook
- [x] Integrate into `Vehicle.jsx`
- [x] Optimize broadcast rate and payload size

#### 2.2 Remote Player Rendering ✅
- [x] Create `RemoteVehicle.jsx` (visual-only version)
- [x] Create `RemoteVehicleManager.jsx`
- [x] Implement transform interpolation buffer
- [x] Add smooth wheel rotation sync

#### 2.3 Configuration Sync ✅
- [x] Create `useConfigSync.js` hook
- [x] Handle config changes for remote players
- [x] Implement model pre-loading for remote configs
- [x] Add loading states for pending models

### Phase 3: Polish & Features

#### 3.1 Player Experience
- [x] Create `PlayerList.jsx` showing all players
- [x] Add player name customization
- [x] Add player colors/identifiers above vehicles
- [ ] Implement player join/leave notifications

#### 3.2 Performance Optimization
- [ ] Implement message batching
- [ ] Add optional compression (MessagePack or similar)
- [ ] Add LOD for distant remote vehicles
- [ ] Optimize re-renders with proper memoization

#### 3.3 Edge Cases
- [x] Handle player disconnection gracefully
- [x] Implement reconnection logic
- [x] Add room timeout/cleanup
- [ ] Handle host migration (if host leaves)

---

## Technical Considerations

### Bandwidth Estimation

```
Per player update:
- position: 12 bytes (3 floats)
- rotation: 16 bytes (4 floats quaternion)
- velocity: 12 bytes (3 floats)
- wheelRotations: 16 bytes (4 floats)
- steering: 4 bytes
- engineRpm: 4 bytes
- overhead: ~20 bytes

Total: ~84 bytes per update
At 20 Hz: ~1.7 KB/s per player
8 players receiving 7 others: ~12 KB/s per client
```

### Latency Handling

```javascript
// Interpolation delay based on measured latency
const getInterpolationDelay = (ping) => {
  // Minimum 50ms, scales with ping
  return Math.max(50, ping * 1.5)
}
```

### Security Considerations

1. **Rate limiting**: Max 30 messages/second per client
2. **Payload validation**: Validate all incoming data shapes
3. **Room codes**: Use cryptographically random codes
4. **Position bounds**: Reject obviously invalid positions
5. **No eval/dynamic code**: Never execute received code

### Mobile Performance

```javascript
// Reduce sync rate on mobile
const getSyncRate = () => {
  return useGameStore.getState().isMobile ? 10 : 20 // Hz
}

// Reduce max remote vehicles on mobile
const getMaxRemoteVehicles = () => {
  return useGameStore.getState().isMobile ? 4 : 8
}
```

---

## File Structure Changes

### New Files to Create

```
/server/                          # New directory
  package.json
  index.js
  src/
    WebSocketServer.js
    RoomManager.js
    Player.js
    MessageHandler.js
    Validator.js

/network/                         # New directory
  NetworkManager.js
  MessageHandler.js
  protocols.js
  compression.js (optional)

/store/
  multiplayerStore.js             # New file

/hooks/
  useTransformBroadcast.js        # New file
  useConfigSync.js                # New file
  useNetworkConnection.js         # New file

/components/scene/
  RemoteVehicle.jsx               # New file
  RemoteVehicleManager.jsx        # New file

/components/ui/
  MultiplayerPanel.jsx            # New file
  PlayerList.jsx                  # New file
  RoomCode.jsx                    # New file
```

## Summary

This multiplayer buildout transforms 4x4 Builder from a single-player experience to a shared environment where players can:

1. **Create or join rooms** with shareable codes
2. **See other players' vehicles** with their custom configurations
3. **Drive together** with smooth interpolated movement
4. **Customize vehicles** with changes synced in real-time

The architecture preserves all existing functionality by:
- Keeping local physics untouched
- Using visual-only rendering for remote players
- Separating network logic into its own layer
- Using efficient state management with Zustand

Estimated total development time: **6-9 weeks** for core functionality, with optional advanced features adding 2+ additional weeks.

---

## Phase 1 Completion Notes (December 6, 2025)

Phase 1 has been successfully implemented. The following files were created:

### Server Files (`server/`)
- `package.json` - Server dependencies (ws, uuid)
- `index.js` - Server entry point with HTTP and WebSocket server
- `config/settings.js` - Server configuration (ports, limits, timeouts)
- `src/WebSocketServer.js` - WebSocket connection management
- `src/RoomManager.js` - Room creation, joining, leaving logic
- `src/Player.js` - Player state class
- `src/MessageHandler.js` - Message routing and handling
- `src/Validator.js` - Input validation utilities
- `src/types.js` - Message types and protocol definitions

### Client Network Files (`network/`)
- `NetworkManager.js` - WebSocket client with reconnection logic
- `protocols.js` - Shared message type definitions

### Client Store (`store/`)
- `multiplayerStore.js` - Zustand store for multiplayer state

### Client Hooks (`hooks/`)
- `useNetworkConnection.js` - React hook for network connection

### Client UI Components (`components/ui/`)
- `MultiplayerPanel.jsx` - Main multiplayer UI panel
- `RoomCode.jsx` - Room code display with copy functionality
- `PlayerList.jsx` - Connected players list

### Modified Files
- `components/ui/Sidebar.jsx` - Added MultiplayerPanel to sidebar

### To Run the Server
```bash
cd server
npm install
npm run dev
```

The server will start on port 8080 by default. The client will automatically attempt to connect to `ws://localhost:8080` when creating or joining rooms.

---

## Phase 2 Completion Notes (December 6, 2025)

Phase 2 has been successfully implemented. The following files were created/modified:

### New Client Hooks (`hooks/`)
- `useTransformBroadcast.js` - Broadcasts local vehicle position/rotation to server at 20Hz
  - Optimized to skip updates when vehicle is stationary
  - Includes position, rotation, velocity, angular velocity, wheel rotations, steering, and engine RPM
- `useConfigSync.js` - Syncs vehicle configuration changes to other players
  - Detects config changes and broadcasts to server
  - Sends initial config when joining a room

### New Scene Components (`components/scene/`)
- `RemoteVehicle.jsx` - Visual-only vehicle for rendering remote players
  - Transform interpolation buffer with configurable delay for smooth movement
  - Velocity-based extrapolation for network hiccups
  - Smooth lerp/slerp for position and rotation
  - Full vehicle rendering (body, addons, wheels) matching local vehicle
  - Player name label displayed above vehicle
- `RemoteVehicleManager.jsx` - Manages all remote vehicle instances
  - Subscribes to multiplayerStore for player updates
  - Creates/removes RemoteVehicle components as players join/leave
  - Routes transform updates to correct vehicle instance

### Modified Files
- `components/scene/Vehicle.jsx` - Added `useTransformBroadcast` hook integration
- `components/scene/Canvas.jsx` - Added `RemoteVehicleManager` and `useConfigSync` hook
- `server/src/Player.js` - Added `angularVelocity` to transform state
- `server/src/Validator.js` - Added `angularVelocity` validation

### Key Features Implemented
1. **Transform Broadcasting**: Local player's vehicle position, rotation, and wheel states are broadcast 20 times per second
2. **Transform Interpolation**: Remote vehicles use a buffer-based interpolation system with 100ms delay for smooth movement
3. **Velocity Extrapolation**: When network packets are delayed, remote vehicles extrapolate based on last known velocity
4. **Configuration Sync**: When a player changes their vehicle (body, color, wheels, etc.), changes are synced to all other players
5. **Player Labels**: Remote vehicles display the player's name above them using HTML overlay

---

## Next Steps

1. ~~Review and approve this plan~~
2. ~~Set up server repository/hosting~~
3. ~~Begin Phase 1 implementation~~ ✅ Complete
4. ~~Begin Phase 2: Vehicle Sync~~ ✅ Complete
5. Establish testing environment with multiple clients
6. Begin Phase 3: Polish & Features (join/leave notifications, performance optimization)
