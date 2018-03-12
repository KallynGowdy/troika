import { Mesh, Vector2, Vector4, PlaneBufferGeometry, Sphere, Matrix4 } from 'three'
import Group3DFacade from '../Group3DFacade'
import Text3DFacade from '../text/Text3DFacade'
import UIBlockLayer3DFacade from './UIBlockLayer3DFacade'
import { makeFlexLayoutNode } from './FlexLayoutNode'
import ParentFacade from '../../ParentFacade'
import { assign } from '../../../utils'

const raycastMesh = new Mesh(new PlaneBufferGeometry(1, 1).translate(0.5, -0.5, 0))
const tempMat4 = new Matrix4()

/**
 * Represents a single block UI element, essentially just a 2D rectangular block that
 * can contain text, be styled with background/border, and participate in flexbox layout.
 * Its behavior and styling is very much like an HTML element using flexbox.
 */
class UIBlock3DFacade extends makeFlexLayoutNode(Group3DFacade) {
  constructor(parent) {
    super(parent)

    // Create rendering layer child definitions
    // These live separate from the main `children` tree
    const depth = this.flexNodeDepth
    this.bgLayer = {
      key: 'bg',
      facade: UIBlockLayer3DFacade,
      depthOffset: -depth
    }
    this.borderLayer = {
      key: 'border',
      facade: UIBlockLayer3DFacade,
      isBorder: true,
      depthOffset: -depth - 1
    }
    this.layers = new ParentFacade(this)
    this.layers.children = [null, null]

    // Create child def for text node
    this.textChild = {
      key: 'text',
      facade: TextFlexNode3DFacade,
      depthOffset: -depth - 2
    }

    this._sizeVec2 = new Vector2()
    this._borderWidthVec4 = new Vector4()
    this._borderRadiiVec4 = new Vector4()
    ;(this._geomBoundingSphere = new Sphere()).version = 0
  }

  afterUpdate() {
    let {
      bgLayer,
      borderLayer,
      textChild,
      layers,
      backgroundColor,
      backgroundMaterial,
      borderWidth,
      borderColor,
      borderMaterial,
      text,
      textMaterial,
      computedLeft,
      computedTop,
      computedWidth,
      computedHeight,
      _borderWidthVec4,
      _sizeVec2
    } = this
    const hasLayout = computedWidth !== null
    const hasNonZeroSize = !!(computedWidth && computedHeight)
    const hasBg = hasNonZeroSize && (backgroundColor != null || backgroundMaterial != null)
    const hasBorder = hasNonZeroSize && borderWidth && (borderColor != null || borderMaterial != null)
    const hasText = !!text

    // Update the block's element and size from flexbox computed values
    // TODO pass left/top as uniforms to avoid matrix recalcs
    if (hasLayout) {
      this.x = computedLeft
      this.y = -computedTop
      if (computedWidth !== _sizeVec2.x || computedHeight !== _sizeVec2.y) {
        _sizeVec2.set(computedWidth, computedHeight)

        // Update pre-worldmatrix bounding sphere
        const sphere = this._geomBoundingSphere
        sphere.radius = Math.sqrt(computedWidth * computedWidth + computedHeight * computedHeight)
        sphere.center.set(computedWidth / 2, computedHeight / 2, 0)
        sphere.version++
      }
    }

    // Get normalized border radii Vector4
    const radii = (hasBg || hasBorder) ? this._normalizeBorderRadius() : null

    // Get normalized border widths Vector4
    //if (borderWidth !== _borderWidthVec4._srcArray) {
      _borderWidthVec4.fromArray(borderWidth)
    //  _borderWidthVec4._srcArray = borderWidth
    //}

    // Update rendering layers...
    if (hasBg) {
      bgLayer.size = _sizeVec2
      bgLayer.color = backgroundColor
      bgLayer.borderRadius = radii
      bgLayer.material = backgroundMaterial
    } else {
      bgLayer = null
    }
    layers.children[0] = bgLayer

    if (hasBorder) {
      borderLayer.size = _sizeVec2
      borderLayer.color = borderColor
      borderLayer.borderWidth = _borderWidthVec4
      borderLayer.borderRadius = radii
      borderLayer.material = borderMaterial
    } else {
      borderLayer = null
    }
    layers.children[1] = borderLayer

    // Update text child...
    if (hasText) {
      textChild.text = text
      textChild.font = getInheritable(this, 'font')
      textChild.fontSize = getInheritable(this, 'fontSize')
      textChild.textAlign = getInheritable(this, 'textAlign')
      textChild.lineHeight = getInheritable(this, 'lineHeight')
      textChild.letterSpacing = getInheritable(this, 'letterSpacing')
      textChild.whiteSpace = getInheritable(this, 'whiteSpace')
      textChild.overflowWrap = getInheritable(this, 'overflowWrap')
      textChild.color = getInheritable(this, 'color')
      textChild.material = textMaterial
      this.children = textChild //NOTE: text content will clobber any other defined children
    }

    super.afterUpdate()
    layers.afterUpdate()
  }
  
  _normalizeBorderRadius() {
    const {
      borderRadius:input,
      computedWidth=0,
      computedHeight=0,
      _borderRadiiVec4:vec4
    } = this

    // Normalize to four corner values
    let tl, tr, br, bl
    if (Array.isArray(input)) {
      const len = input.length
      tl = input[0] || 0
      tr = (len > 1 ? input[1] : input[0]) || 0
      br = (len > 2 ? input[2] : input[0]) || 0
      bl = (len > 3 ? input[3] : len > 1 ? input[1] : input[0]) || 0
    } else {
      tl = tr = br = bl = input || 0
    }

    if (tl !== 0 || tr !== 0 || br !== 0 || bl !== 0) { //avoid work for common no-radius case
      // Resolve percentages
      const minDimension = Math.min(computedWidth, computedHeight)
      if (typeof tl === 'string' && /%$/.test(tl)) {
        tl = parseInt(tl, 10) / 100 * minDimension
      }
      if (typeof tr === 'string' && /%$/.test(tr)) {
        tr = parseInt(tr, 10) / 100 * minDimension
      }
      if (typeof bl === 'string' && /%$/.test(bl)) {
        bl = parseInt(bl, 10) / 100 * minDimension
      }
      if (typeof br === 'string' && /%$/.test(br)) {
        br = parseInt(br, 10) / 100 * minDimension
      }

      // If any radii overlap based on the block's current size, reduce them all by the same ratio, ala CSS3.
      let radiiAdjRatio = Math.min(
        computedWidth / (tl + tr),
        computedHeight / (tr + br),
        computedWidth / (br + bl),
        computedHeight / (bl + tl)
      )
      if (radiiAdjRatio < 1) {
        tl *= radiiAdjRatio
        tr *= radiiAdjRatio
        bl *= radiiAdjRatio
        br *= radiiAdjRatio
      }
    }

    // Update the Vector4 if anything hanged
    if (tl !== vec4.x || tr !== vec4.y || br !== vec4.z || bl !== vec4.w) {
      vec4.set(tl, tr, br, bl)
    }

    return vec4
  }

  /**
   * @override Use our textGeometry's boundingSphere which we keep updated as we get new
   * layout metrics.
   */
  _getGeometryBoundingSphere() {
    return this._geomBoundingSphere.radius ? this._geomBoundingSphere : null
  }

  /**
   * @override Custom raycaster to test against the layout block
   */
  raycast(raycaster) {
    const {computedWidth, computedHeight} = this
    if (computedWidth && computedHeight) {
      raycastMesh.matrixWorld.multiplyMatrices(
        this.threeObject.matrixWorld,
        tempMat4.makeScale(computedWidth, computedHeight, 1)
      )
      return this._raycastObject(raycastMesh, raycaster)
    }
    return null
  }


  destructor() {
    this.layers.destructor()
    super.destructor()
  }
}
assign(UIBlock3DFacade.prototype, {
  computedLeft: null,
  computedTop: null,
  computedWidth: null,
  computedHeight: null,

  font: 'inherit',
  fontSize: 'inherit',
  lineHeight: 'inherit',
  letterSpacing: 'inherit',
  whiteSpace: 'inherit',
  overflowWrap: 'inherit',
  color: 'inherit'
})


/**
 * Wrapper for Text3DFacade that lets it act as a flex layout node.
 */
class TextFlexNode3DFacade extends makeFlexLayoutNode(Text3DFacade) {
  afterUpdate() {
    // Read computed layout
    const {
      computedLeft,
      computedTop,
      computedWidth
    } = this

    // Update position and size if flex layout has been completed
    const hasLayout = computedWidth !== null
    if (hasLayout) {
      this.x = computedLeft || 0
      this.y = -computedTop || 0
      this.maxWidth = computedWidth
    }

    // Check text props that could affect flex layout
    // TODO seems odd that this happens here rather than FlexLayoutNode
    const flexStyles = this._flexStyles
    for (let i = 0, len = flexLayoutTextProps.length; i < len; i++) {
      const prop = flexLayoutTextProps[i]
      const val = getInheritable(this, prop)
      if (val !== flexStyles[prop]) {
        flexStyles[prop] = this[prop]
        this._needsFlexLayout = true
      }
    }

    this.threeObject.visible = hasLayout

    super.afterUpdate()
  }
  getBoundingSphere() {
    return null //parent will handle bounding sphere and raycasting
  }
}
// Redefine the maxWidth property so it's not treated as a flex layout affecting prop
Object.defineProperty(TextFlexNode3DFacade.prototype, 'maxWidth', {
  value: Infinity,
  enumerable: true,
  writable: true
})
const flexLayoutTextProps = ['text', 'font', 'fontSize', 'lineHeight', 'letterSpacing', 'whiteSpace', 'overflowWrap']



function getInheritable(owner, prop) {
  let val
  while (owner && (val = owner[prop]) === 'inherit') {
    owner = owner._flexParent
    val = undefined
  }
  return val
}



export default UIBlock3DFacade