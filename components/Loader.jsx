import React from 'react'

export default function Loader() {
    return (
        <div id='loader'>
            <div className='spinner'>
                <div className='cube'>
                    <div className='face front'></div>
                    <div className='face back'></div>
                    <div className='face left'></div>
                    <div className='face right'></div>
                    <div className='face top'></div>
                    <div className='face bottom'></div>
                </div>
                <div id='message' className='text'>
                    <h3>Loading</h3>
                </div>
            </div>
        </div>
    )
}
