import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Composition,
  Img,
  Sequence,
  interpolate,
  registerRoot,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const C = {
  ink: '#090b0b',
  panel: '#111515',
  line: '#2b3433',
  paper: '#e8e4d8',
  muted: '#9da6a2',
  signal: '#f4a641',
  safe: '#70c79a',
  danger: '#e46b5d',
};

const scenes = [
  {from: 0, duration: 210, kind: 'hook' as const},
  {from: 210, duration: 450, kind: 'evidence' as const},
  {from: 660, duration: 450, kind: 'response' as const},
  {from: 1110, duration: 390, kind: 'action' as const},
  {from: 1500, duration: 420, kind: 'failure' as const},
  {from: 1920, duration: 390, kind: 'proof' as const},
  {from: 2310, duration: 390, kind: 'close' as const},
];

const subtitles = [
  [0, 3.84, 'A protocol pause key should not live with one person.'],
  [3.84, 7.92, 'Holdfast makes containment a private two-person decision.'],
  [7.92, 13.36, 'A detector watches one Solana vault and reconstructs the prior balance.'],
  [13.36, 19.6, 'This planted withdrawal is 25 percent. The policy triggers above 20.'],
  [19.6, 23.76, 'The detector can open an incident. It cannot pause the vault.'],
  [23.76, 28.8, 'The incident moves into a permissioned MagicBlock Ephemeral Rollup.'],
  [28.8, 33.84, 'Individual approvals stay private. One responder is never enough.'],
  [33.84, 38.32, 'Two distinct responders must approve the same stored action hash.'],
  [38.32, 41.68, 'Quorum does not authorize an arbitrary runbook.'],
  [41.68, 46.64, 'It commits one expiring pause action against one separate vault program.'],
  [46.64, 50.24, 'Magic Actions carry that decision back to Solana.'],
  [50.24, 52.72, 'A commit is not containment.'],
  [52.72, 58.24, 'If the pause fails, Holdfast keeps the receipt pending and says unpaused.'],
  [58.24, 63.04, 'Success requires an executed receipt and the matching paused vault.'],
  [63.04, 66.64, 'Judges can verify the finished run without a wallet.'],
  [66.64, 71.44, 'The browser reads both deployed accounts directly from MagicBlock Devnet.'],
  [71.44, 76.88, 'Their owners, layouts, status, and incident identifiers must all agree.'],
  [76.88, 82.96, 'Holdfast turns protocol response into a constrained, inspectable decision.'],
  [82.96, 87.12, 'Two people can stop the test drain. One person cannot.'],
] as const;

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: C.ink, overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: 0, opacity: 0.16, backgroundImage: `linear-gradient(${C.line} 1px, transparent 1px), linear-gradient(90deg, ${C.line} 1px, transparent 1px)`, backgroundSize: '48px 48px', transform: `translate(${frame % 48}px, ${frame % 48}px)`}} />
      <div style={{position: 'absolute', width: 620, height: 620, borderRadius: 999, background: C.signal, filter: 'blur(170px)', opacity: 0.08, right: -180, top: -220}} />
    </AbsoluteFill>
  );
};

const Brand: React.FC<{small?: boolean}> = ({small = false}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: small ? 12 : 18}}>
    <Img src={staticFile('assets/mark.svg')} style={{width: small ? 34 : 58, height: small ? 34 : 58}} />
    <span style={{fontSize: small ? 22 : 40, fontWeight: 800, letterSpacing: '-0.04em'}}>HOLDFAST</span>
  </div>
);

const Tag: React.FC<{children: React.ReactNode; tone?: 'signal' | 'safe' | 'danger'}> = ({children, tone = 'signal'}) => {
  const color = tone === 'safe' ? C.safe : tone === 'danger' ? C.danger : C.signal;
  return <span style={{border: `1px solid ${color}`, color, padding: '7px 11px', borderRadius: 3, fontSize: 15, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase'}}>{children}</span>;
};

const Screenshot: React.FC<{file: string; focus?: 'left' | 'right' | 'center'}> = ({file, focus = 'center'}) => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, 400], [1.02, 1.08], {extrapolateRight: 'clamp'});
  const x = focus === 'left' ? '45%' : focus === 'right' ? '55%' : '50%';
  return (
    <div style={{position: 'absolute', left: 62, right: 62, top: 118, bottom: 112, border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 24px 80px #000a'}}>
      <Img src={staticFile(`assets/${file}`)} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${x} center`, transform: `scale(${zoom})`}} />
      <div style={{position: 'absolute', inset: 0, boxShadow: 'inset 0 0 90px #0007'}} />
    </div>
  );
};

const Header: React.FC<{label: string; tone?: 'signal' | 'safe' | 'danger'}> = ({label, tone}) => (
  <div style={{position: 'absolute', top: 42, left: 62, right: 62, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 3}}>
    <Brand small />
    <Tag tone={tone}>{label}</Tag>
  </div>
);

const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 18}});
  return <AbsoluteFill style={{color: C.paper, alignItems: 'center', justifyContent: 'center'}}>
    <Background />
    <div style={{zIndex: 2, textAlign: 'center', opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px)`}}>
      <Brand />
      <h1 style={{fontSize: 78, lineHeight: 0.96, margin: '46px 0 22px', letterSpacing: '-0.055em'}}>TWO KEYS<br/><span style={{color: C.signal}}>MUST AGREE.</span></h1>
      <p style={{fontSize: 23, color: C.muted}}>Private quorum circuit breaker for Solana incidents.</p>
    </div>
  </AbsoluteFill>;
};

const ProductScene: React.FC<{kind: 'evidence' | 'response' | 'action' | 'failure' | 'proof'}> = ({kind}) => {
  const map = {
    evidence: {file: '01-response-room.png', label: 'Breach evidence · 25%', tone: 'danger' as const, focus: 'left' as const},
    response: {file: '01-response-room.png', label: 'Private response · 1 / 2', tone: 'signal' as const, focus: 'right' as const},
    action: {file: '02-contained-outcome.png', label: 'Fixed action · expiring', tone: 'signal' as const, focus: 'center' as const},
    failure: {file: '04-failed-action.png', label: 'Commit ≠ containment', tone: 'danger' as const, focus: 'right' as const},
    proof: {file: '03-live-devnet-proof.png', label: 'Devnet proof · wallet-free', tone: 'safe' as const, focus: 'center' as const},
  }[kind];
  return <AbsoluteFill style={{background: C.ink, color: C.paper}}>
    <Background />
    <Header label={map.label} tone={map.tone} />
    <Screenshot file={map.file} focus={map.focus} />
  </AbsoluteFill>;
};

const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const line = interpolate(frame, [18, 70], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{color: C.paper, alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
    <Background />
    <div style={{zIndex: 2}}>
      <Brand />
      <h2 style={{fontSize: 64, lineHeight: 1.02, letterSpacing: '-0.05em', margin: '38px 0 18px'}}>TWO PEOPLE CAN STOP THE DRAIN.<br/><span style={{color: C.signal}}>ONE PERSON CANNOT.</span></h2>
      <div style={{height: 2, width: 620 * line, margin: '30px auto', background: C.signal}} />
      <p style={{fontSize: 19, color: C.muted}}>MagicBlock Ephemeral Rollups · Solana Devnet</p>
    </div>
  </AbsoluteFill>;
};

const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const item = subtitles.find(([start, end]) => frame >= start * 30 && frame < end * 30);
  if (!item) return null;
  return <div style={{position: 'absolute', zIndex: 20, left: 170, right: 170, bottom: 34, textAlign: 'center'}}>
    <span style={{display: 'inline', padding: '8px 13px', color: '#fff', background: '#050606e8', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone', fontSize: 23, lineHeight: 1.45, fontWeight: 650, boxShadow: `inset 3px 0 ${C.signal}`}}>{item[2]}</span>
  </div>;
};

const Main: React.FC = () => <AbsoluteFill style={{fontFamily: 'Inter, ui-sans-serif, system-ui', background: C.ink}}>
  <Audio src={staticFile('audio/narration.mp3')} volume={1} />
  {scenes.map((scene) => <Sequence key={scene.kind} from={scene.from} durationInFrames={scene.duration} premountFor={30}>
    {scene.kind === 'hook' ? <Hook /> : scene.kind === 'close' ? <Close /> : <ProductScene kind={scene.kind} />}
  </Sequence>)}
  <Captions />
</AbsoluteFill>;

const Social: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = spring({frame, fps: 30, config: {damping: 12}});
  return <AbsoluteFill style={{fontFamily: 'Inter, ui-sans-serif, system-ui', color: C.paper, background: C.ink, padding: 78, justifyContent: 'space-between'}}>
    <Background />
    <div style={{zIndex: 2}}><Brand /></div>
    <div style={{zIndex: 2, transform: `scale(${interpolate(pulse, [0, 1], [0.86, 1])})`}}>
      <div style={{fontSize: 220, fontWeight: 900, lineHeight: 0.86, letterSpacing: '-0.08em'}}>2<span style={{color: C.muted}}>/</span>3</div>
      <h1 style={{fontSize: 104, lineHeight: 0.95, letterSpacing: '-0.06em', margin: '55px 0'}}>ONE RESPONDER<br/><span style={{color: C.danger}}>CANNOT PAUSE.</span></h1>
      <p style={{fontSize: 42, lineHeight: 1.25, color: C.muted}}>Private quorum containment<br/>on MagicBlock + Solana.</p>
    </div>
    <div style={{zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><Tag tone="safe">Devnet proven</Tag><span style={{fontSize: 27, fontWeight: 800}}>HOLDFAST</span></div>
  </AbsoluteFill>;
};

const Root: React.FC = () => <>
  <Composition id="Main" component={Main} durationInFrames={2700} fps={30} width={1280} height={720} />
  <Composition id="Social" component={Social} durationInFrames={300} fps={30} width={1080} height={1920} />
</>;

registerRoot(Root);
