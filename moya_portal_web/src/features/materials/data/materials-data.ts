import { Bot, Copy, Image, Layers3, Send } from 'lucide-react'
import type { ModuleFeatureCard } from '../../../ui/ModuleFeatureStrip'
import type {
  CloudAsset,
  CloudFilter,
  CloudFolder,
  Collaborator,
  MaterialAssetCard,
  MaterialsTab,
} from '../types'

const publicAssetBase = new URL('.', document.baseURI).href
const publicAsset = (assetPath: string) => `${publicAssetBase}${assetPath.replace(/^\/+/, '')}`

export const materialTabs: Array<[MaterialsTab, string]> = [
  ['library', '素材库'],
  ['image', '图片'],
  ['video', '视频'],
  ['voice', '声音'],
  ['avatar', '数字人'],
]

export const materialAssets: MaterialAssetCard[] = [
  { name: '产品主视觉', type: '图片', state: '已授权', used: 12, tone: 'green' },
  { name: '口播 B-roll', type: '视频', state: '可使用', used: 8, tone: 'blue' },
  { name: '数字人形象 A', type: '数字人', state: '已绑定', used: 6, tone: 'purple' },
  { name: '场景背景', type: '图片', state: '缺 2 张', used: 3, tone: 'orange' },
  { name: '标题花字模板', type: '字幕', state: '可使用', used: 18, tone: 'cyan' },
  { name: '客户案例截图', type: '证明', state: '待授权', used: 1, tone: 'red' },
]

export const materialFeatureCards: ModuleFeatureCard[] = [
  { title: '图文矩阵', desc: '集中进入图文克隆、生图、生视频和参考图编辑', Icon: Copy, tone: 'purple' },
  { title: '素材生产', desc: 'AI与工具生产图片、视频和声音素材', Icon: Image, tone: 'cyan', image: publicAsset('/feature-cards/material-production.png') },
  { title: '素材库', desc: '图片、视频、口播和授权状态集中管理', Icon: Image, tone: 'cyan', image: publicAsset('/feature-cards/material-library.png') },
  { title: '数字人', desc: '绑定形象、声音和口播模板', Icon: Bot, tone: 'purple', image: publicAsset('/feature-cards/digital-human.png') },
  { title: '缺口补齐', desc: '按方案自动生成待补素材清单', Icon: Layers3, tone: 'orange', image: publicAsset('/feature-cards/gap-fill.png') },
  { title: 'AI商品口播生成', desc: '商品卖点一键生成口播脚本与视频', Icon: Bot, tone: 'purple', image: publicAsset('/feature-cards/product-spokesperson.png') },
  { title: 'AI商品展示生成', desc: '商品主图、场景海报和卖点展示', Icon: Image, tone: 'blue', image: publicAsset('/feature-cards/product-display.png') },
  { title: '门店引流视频生成', desc: '本地门店到店转化短视频', Icon: Send, tone: 'orange', image: publicAsset('/feature-cards/store-traffic-video.png') },
]

export const cloudFilters: CloudFilter[] = ['全部', '素材', '工程', '成片', '视频', '图片', '音频']

export const initialCloudFolders: CloudFolder[] = [
  { id: 'folder-test', name: '测试1', parentId: null, count: 3, shared: true },
  { id: 'folder-category', name: '分类', parentId: 'folder-test', count: 5, shared: true },
  { id: 'folder-scent', name: '香氛试用', parentId: 'folder-category', count: 3, shared: true },
  { id: 'folder-handheld', name: '手部试用', parentId: 'folder-category', count: 2 },
  { id: 'folder-product-in', name: '产品引入', parentId: 'folder-category', count: 1 },
  { id: 'folder-start', name: '产品开场', parentId: 'folder-category', count: 10 },
  { id: 'folder-effect', name: '产品效果', parentId: 'folder-category', count: 1 },
  { id: 'folder-proof', name: '视频证明', parentId: null, count: 10 },
  { id: 'folder-long', name: '长视频切片', parentId: null, count: 1 },
  { id: 'folder-live', name: '直播切片', parentId: null, count: 0 },
  { id: 'folder-douyin', name: '投放短视频', parentId: null, count: 2 },
  { id: 'folder-other', name: '其他项目', parentId: null, count: 36 },
  { id: 'folder-copy', name: '图文', parentId: null, count: 6 },
]

export const initialCloudAssets: CloudAsset[] = [
  { id: 'asset-1', folderId: 'folder-scent', name: 'c1-1香氛试用', kind: '视频', size: '3.3 MB', duration: '00:03', status: '已转码', tone: 'cyan' },
  { id: 'asset-2', folderId: 'folder-scent', name: 'c1-2脸部试用', kind: '视频', size: '4.9 MB', duration: '00:04', status: '已转码', tone: 'orange' },
  { id: 'asset-3', folderId: 'folder-scent', name: 'c1脸部试用', kind: '视频', size: '4.6 MB', duration: '00:05', status: '可使用', tone: 'blue' },
  { id: 'asset-4', folderId: 'folder-test', name: 'uniqlo', kind: '视频', size: '22.3 MB', duration: '00:33', status: '已导入', tone: 'gray' },
  { id: 'asset-5', folderId: 'folder-test', name: '风叶-欧莱雅小金管', kind: '视频', size: '8.8 MB', duration: '00:16', status: '已导入', tone: 'purple' },
  { id: 'asset-6', folderId: 'folder-proof', name: '验收口播_153', kind: '视频', size: '14.2 MB', duration: '00:29', status: '可使用', tone: 'green' },
  { id: 'asset-7', folderId: 'folder-proof', name: '卖点截图_153', kind: '图片', size: '2.1 MB', status: '已转码', tone: 'orange' },
]

export const initialCollaborators: Collaborator[] = [
  { name: 'ms', phone: '15812430995', role: '所有者', enabled: true },
  { name: '刘江', phone: '18897967083', role: '可管理', enabled: true },
  { name: '王海帆', phone: '18717932365', role: '无权限', enabled: false },
  { name: '刘晓铭', phone: '15397504896', role: '无权限', enabled: false },
]
