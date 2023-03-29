import React from 'react'

const Modal = (props) => {
  return (
    <div id="overlay">
      <div className="scroll">
        <div className="modal">{props.children}</div>
      </div>
    </div>
  )
}

export default Modal
