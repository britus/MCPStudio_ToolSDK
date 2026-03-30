//
//  SamplePluginDyLib.hpp
//  SamplePluginDyLib

#ifndef SamplePluginDyLib_
#define SamplePluginDyLib_

/* The classes below are exported */
#pragma GCC visibility push(default)

class SamplePluginDyLib
{
    public:
    void HelloWorld(const char *);
};

#pragma GCC visibility pop
#endif
