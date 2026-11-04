// Quita el fondo con Vision (subject lifting): recorta.swift <entrada> <salida.png>
import Foundation
import Vision
import CoreImage
import AppKit

let args = CommandLine.arguments
guard args.count == 3 else { fputs("uso: recorta <in> <out.png>\n", stderr); exit(2) }
guard let ci = CIImage(contentsOf: URL(fileURLWithPath: args[1])) else { fputs("no se pudo leer \(args[1])\n", stderr); exit(1) }
let req = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(ciImage: ci, options: [:])
try handler.perform([req])
guard let res = req.results?.first else { fputs("sin sujeto\n", stderr); exit(1) }
let buf = try res.generateMaskedImage(ofInstances: res.allInstances, from: handler, croppedToInstancesExtent: false)
let out = CIImage(cvPixelBuffer: buf)
let ctx = CIContext()
guard let cg = ctx.createCGImage(out, from: out.extent) else { exit(1) }
let rep = NSBitmapImageRep(cgImage: cg)
guard let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
try png.write(to: URL(fileURLWithPath: args[2]))
print("ok \(cg.width)x\(cg.height) instancias \(res.allInstances.count)")
