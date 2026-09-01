from nurb import *

# The desk, for the talk's room (src/scene/Room.jsx).
#
# RENDER ASSET — never printed. Ignore printability findings.
#
# It replaces an infinite plane. A plane has no thickness, so at any angle
# below the surface it ends in a zero-height line and the desk reads as a
# floating sheet. What sells a desk is the FRONT EDGE: a slab with real depth,
# softened just enough to catch a thin line of the screen's light along it.
#
# The top is what the monitor sits on, so its surface is z = 0 and the slab
# hangs below into -Z. That way the scene positions it by the surface, which is
# the only height anyone cares about.
#
# Scale: mm.


@part
def desk(
    top_width=2200.0,
    top_depth=950.0,
    top_thickness=32.0,
    edge_round=9.0,
    corner_radius=24.0,
    draft=False,
):
    """
    top_width: how wide the desk is, left to right
    top_depth: how far it reaches from the front edge to the wall
    top_thickness: how thick the slab is
    edge_round: how softly the front and side edges are rounded over
    corner_radius: how rounded the desk's corners are, seen from above
    """

    top = Pos(0, 0, -top_thickness / 2) * Box(top_width, top_depth, top_thickness)
    top = fillet(top.edges().filter_by(Axis.Z), corner_radius)

    if draft:
        return top

    # Round the top and bottom rims rather than chamfering them. A desk edge is
    # a bullnose or a soft radius, and the thin curved highlight that runs along
    # it is the single detail that makes the slab read as furniture — a hard
    # 90° edge under a raking light reads as a rendered box.
    horizontal = top.edges().filter_by(Plane.XY)
    return fillet(horizontal, edge_round)
