from nurb import *

# A closed notebook, for the talk's desk (src/scene/Props.jsx).
#
# RENDER ASSET — never printed. Ignore printability findings.
#
# The flattest thing on the desk, which is exactly why it's useful: it sits in
# the pool of light the screen throws and gives that pool something to fall
# across. A light pool on a bare surface reads as a gradient; the same pool
# crossing an object with an edge reads as light.
#
# Two solids in one: the page block, inset slightly, and the cover wrapping it
# with a thicker spine. That inset is the whole read — it's the line of shadow
# between cover and pages that says "book" rather than "slab".
#
# Scale: mm. Sits on z = 0.


@part
def notebook(
    width=148.0,
    height=210.0,
    thickness=16.0,
    cover_overhang=3.0,
    cover_thickness=2.2,
    spine_radius=7.0,
    corner_radius=6.0,
    draft=False,
):
    """
    width: how wide the notebook is, closed
    height: how tall it is
    thickness: total thickness including both covers
    cover_overhang: how far the cover projects past the pages on three sides
    cover_thickness: how thick each cover board is
    corner_radius: how rounded the outer corners are
    spine_radius: how rounded the spine edge is
    """

    page_w = width - cover_overhang * 2
    page_h = height - cover_overhang * 2
    page_t = thickness - cover_thickness * 2

    # Page block, sitting between the two covers.
    pages = Pos(cover_overhang / 2, 0, thickness / 2) * Box(page_w, page_h, page_t)
    pages = fillet(pages.edges().filter_by(Axis.Z), corner_radius * 0.5)

    # Covers: two boards, full size.
    def board(z):
        b = Pos(0, 0, z) * Box(width, height, cover_thickness)
        return fillet(b.edges().filter_by(Axis.Z), corner_radius)

    lower = board(cover_thickness / 2)
    upper = board(thickness - cover_thickness / 2)

    # Spine: a rounded bar closing the bound edge, so the covers and pages read
    # as one object rather than a stack of three slabs.
    spine = Pos(-width / 2 + spine_radius, 0, thickness / 2) * Box(
        spine_radius * 2, height, thickness
    )
    spine = fillet(
        spine.edges().filter_by(Axis.Y).filter_by(
            lambda e: e.bounding_box().min.X < -width / 2 + spine_radius * 0.5
        ),
        spine_radius * 0.9,
    )

    book = pages + lower + upper + spine

    if draft:
        return book

    return polish(book, book.edges(), 0.8)
