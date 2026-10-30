import {PlaybackCheckpoint} from '../lib/playbackCheckpoint'
const source={storyId:'episode-2',source:'https://audio.example/episode-2.mp3',segment:0}
describe('phone interruption checkpoint',()=>{
 test('restores a reset media element at the exact interruption offset',()=>{
  const checkpoint=new PlaybackCheckpoint()
  checkpoint.capture(source,347.625)
  const audio={currentTime:0,duration:1200,ended:false}
  expect(checkpoint.position(source,0)).toBe(347.625)
  expect(checkpoint.restore(audio,source)).toBe(true)
  expect(audio.currentTime).toBe(347.625)
 })
 test('a pause at a later or intentionally rewound offset keeps that offset',()=>{
  const checkpoint=new PlaybackCheckpoint()
  checkpoint.capture(source,400)
  checkpoint.capture(source,385.4)
  expect(checkpoint.position(source,0)).toBe(385.4)
  expect(checkpoint.restore({currentTime:385.4,duration:1200,ended:false},source)).toBe(false)
 })
 test('a reset timeupdate cannot overwrite the checkpoint with zero',()=>{
  const checkpoint=new PlaybackCheckpoint();checkpoint.capture(source,91);checkpoint.capture(source,0)
  expect(checkpoint.position(source,0)).toBe(91)
 })
 test.each([{...source,storyId:'episode-3'},{...source,source:'different.mp3'},{...source,segment:1}])('never restores into another story/source/segment: %o',other=>{
  const checkpoint=new PlaybackCheckpoint();checkpoint.capture(source,300)
  expect(checkpoint.position(other,0)).toBe(0)
 })
 test('explicit seek/start-over clears old position; natural end never restores it',()=>{
  const checkpoint=new PlaybackCheckpoint();checkpoint.capture(source,300)
  expect(checkpoint.position(source,0,true)).toBe(0)
  checkpoint.clear();expect(checkpoint.position(source,0)).toBe(0)
 })
 test('waits for metadata and does not seek beyond a replacement file',()=>{
  const checkpoint=new PlaybackCheckpoint();checkpoint.capture(source,300)
  for(const duration of [NaN,0,200])expect(checkpoint.restore({currentTime:0,duration,ended:false},source)).toBe(false)
  const audio={currentTime:0,duration:1000,ended:false};expect(checkpoint.restore(audio,source)).toBe(true)
 })
})
